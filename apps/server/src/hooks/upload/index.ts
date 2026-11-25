import { isUtf8 } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { and, asc, eq, inArray, lt } from 'drizzle-orm';

import { logger, ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, pgAdvisoryXactLock, schemas } from '@/database/index.js';
import { readStreamToBuffer } from '@/utils/index.js';
import { contentTypesByExtension, getFileExtension } from '@repo/shared';
import { getUploadPolicy, uploadConfig } from './config.js';
import * as storage from './storage.js';

import type { Readable } from 'node:stream';
import type { DbTransaction } from '@/database/index.js';
import type {
  FileAccess,
  FilePurpose,
  UploadedFile,
  Upload as UploadApi,
  UploadMode,
  UploadSessionStatus,
} from '@repo/types';
import type {
  FileReader,
  FileUrlOptions,
  PutFileInput,
  ReadableFileSource,
  StoredFile,
} from './types.js';

export type {
  FileUrlOptions,
  PutFileInput,
  ReadableFileSource,
} from './types.js';

/** 启动时检查私有存储是否可访问。 */
async function checkBucket(): Promise<void> {
  await storage.checkBucket();
}

/** 初始化或幂等恢复客户端直传，会话仅保存文件传输信息。 */
async function initialize(
  input: UploadApi['init']['body'],
  userId: string,
): Promise<UploadApi['init']['resp']> {
  if (!userId || !input) throw new ROOT_ERROR('非法参数');
  const clientPurposes: readonly string[] = uploadConfig.clientPurposes;
  if (!clientPurposes.includes(input.purpose)) {
    throw new ROOT_ERROR('非法参数');
  }
  const { filename, extension } = validateFileDeclaration(input);
  if (
    typeof input.idempotencyKey !== 'string' ||
    !input.idempotencyKey.trim() ||
    input.idempotencyKey.length > 255
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  let createdMultipart:
    | { bucket: string; objectKey: string; uploadId: string }
    | undefined;
  let createdFileId: string | undefined;
  let session: UploadSession;
  try {
    session = await db.transaction(async (transaction) => {
      await pgAdvisoryXactLock(
        transaction,
        'upload-init',
        JSON.stringify([userId, input.idempotencyKey]),
      );
      const [existing] = await transaction
        .select({
          session: schemas.file_upload_sessions,
          file: schemas.files,
        })
        .from(schemas.file_upload_sessions)
        .innerJoin(
          schemas.files,
          eq(schemas.files.file_id, schemas.file_upload_sessions.file_id),
        )
        .where(
          and(
            eq(schemas.file_upload_sessions.create_user_id, userId),
            eq(
              schemas.file_upload_sessions.idempotency_key,
              input.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (existing) {
        if (existing.file.filename !== filename) {
          throw new ROOT_ERROR('非法参数');
        }
        if (existing.file.size !== input.size) {
          throw new ROOT_ERROR('非法参数');
        }
        if (existing.file.declared_content_type !== input.contentType) {
          throw new ROOT_ERROR('非法参数');
        }
        if (existing.file.purpose !== input.purpose) {
          throw new ROOT_ERROR('非法参数');
        }
        return existing.session;
      }
      const now = new Date();
      const fileId = randomUUID();
      createdFileId = fileId;
      const objectKey = buildObjectKey(fileId, extension, now);
      const bucket = storage.bucket;
      let mode: UploadMode = 'single';
      let plan;
      if (input.size >= uploadConfig.multipartThresholdBytes) {
        mode = 'multipart';
        plan = calculateMultipartPlan(input.size);
      }
      let uploadId: string | undefined;
      if (mode === 'multipart') {
        const temporary = {
          bucket,
          objectKey: temporaryObjectKey(objectKey),
        };
        uploadId = await storage.createMultipart({
          ...temporary,
          contentType: input.contentType,
        });
        createdMultipart = { ...temporary, uploadId };
      }
      await transaction.insert(schemas.files).values({
        file_id: fileId,
        purpose: input.purpose,
        filename,
        extension,
        declared_content_type: input.contentType,
        content_type: null,
        size: input.size,
        bucket,
        object_key: objectKey,
        status: 'pending',
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      });
      const [created] = await transaction
        .insert(schemas.file_upload_sessions)
        .values({
          session_id: randomUUID(),
          file_id: fileId,
          idempotency_key: input.idempotencyKey,
          mode,
          upload_id: uploadId ?? null,
          part_size: plan?.partSize ?? null,
          part_count: plan?.partCount ?? null,
          status: 'initialized',
          expire_timestamp: new Date(
            now.getTime() + uploadConfig.sessionExpiresSeconds * 1000,
          ),
          create_user_id: userId,
          create_timestamp: now,
          last_update_user_id: userId,
          last_update_timestamp: now,
        })
        .returning();
      if (!created) throw new ROOT_ERROR('数据异常');
      return created;
    });
  } catch (error) {
    if (createdMultipart && createdFileId) {
      // 事务提交回执可能丢失，先确认会话未持久化再回收远程分片。
      const [persisted] = await db
        .select({ id: schemas.file_upload_sessions.session_id })
        .from(schemas.file_upload_sessions)
        .where(eq(schemas.file_upload_sessions.file_id, createdFileId))
        .limit(1);
      if (!persisted)
        await storage.abortMultipart(createdMultipart).catch(() => undefined);
    }
    throw error;
  }
  const result = await buildInitResponse(session);
  logger.info(
    {
      event: 'upload.initialized',
      sessionId: session.session_id,
      mode: session.mode,
      userId,
    },
    '文件上传会话已初始化',
  );
  return result;
}

/** 为当前用户的有效 Multipart 会话签名一个分片。 */
async function signPart(
  input: UploadApi['sign-parts']['body'],
  userId: string,
): Promise<UploadApi['sign-parts']['resp']> {
  const { session, file } = await requireUploadSession(input.sessionId, userId);
  assertTransferableUploadSession(session);
  if (
    session.mode !== 'multipart' ||
    !session.upload_id ||
    !session.part_count
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  const partNumber = input.partNumber;
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > session.part_count
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  const uploadUrl = await storage.presignPart({
    ...temporaryReference(file),
    uploadId: session.upload_id,
    partNumber,
  });
  logger.debug(
    {
      event: 'upload.part_signed',
      sessionId: session.session_id,
      partNumber,
      userId,
    },
    '上传分片签名已生成',
  );
  return { uploadUrl };
}

/** 读取真实分片并原子推进传输状态，供刷新与断点恢复使用。 */
async function listParts(
  sessionId: string,
  userId: string,
): Promise<UploadApi['list-parts']['resp']> {
  const { session, file } = await requireUploadSession(sessionId, userId);
  assertTransferableUploadSession(session);
  if (session.mode !== 'multipart' || !session.upload_id) return { parts: [] };
  const parts = await storage.listParts({
    ...temporaryReference(file),
    uploadId: session.upload_id,
  });
  const updated = await transitionUploadSession(
    session,
    ['initialized', 'uploading'],
    'uploading',
    userId,
  );
  if (!updated)
    throw new ROOT_ERROR('文件上传: 上传会话状态已变更，请刷新后重试');
  logger.debug(
    {
      event: 'upload.parts_restored',
      sessionId,
      partCount: parts.length,
      userId,
    },
    '已读取真实上传分片',
  );
  return { parts };
}

/** 固化并验证上传对象，文件可信状态与会话完成状态原子发布。 */
async function complete(
  sessionId: string,
  userId: string,
): Promise<UploadedFile> {
  const { session, file } = await requireUploadSession(sessionId, userId);
  if (session.status === 'completed') return toUploadedFile(file);
  assertTransferableUploadSession(session);
  const claimed = await transitionUploadSession(
    session,
    ['initialized', 'uploading'],
    'completing',
    userId,
  );
  if (!claimed) throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
  const started = Date.now();
  const temporary = temporaryReference(file);
  try {
    if (session.mode === 'multipart') {
      if (!session.upload_id || !session.part_count || !session.part_size)
        throw new ROOT_ERROR('非法参数');
      const reference = { ...temporary, uploadId: session.upload_id };
      const parts = await storage.listParts(reference);
      if (parts.length !== session.part_count) {
        throw new ROOT_ERROR('文件上传: 文件分片校验不匹配，请重新上传');
      }
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        const expectedSize = Math.min(
          session.part_size,
          file.size - index * session.part_size,
        );
        if (
          !part ||
          part.partNumber !== index + 1 ||
          part.size !== expectedSize
        ) {
          throw new ROOT_ERROR('文件上传: 文件分片校验不匹配，请重新上传');
        }
      }
      await storage.completeMultipart({ ...reference, parts });
    }
    const finalReference = {
      bucket: file.bucket,
      objectKey: file.object_key,
    };
    await storage.copy(temporary, finalReference);
    const contentType = await validateStoredObject(file);
    const verified = await db.transaction(async (transaction) => {
      const completed = await transitionUploadSession(
        session,
        ['completing'],
        'completed',
        userId,
        transaction,
      );
      if (!completed) throw new ROOT_ERROR('上传会话状态已变更');
      const [verified] = await transaction
        .update(schemas.files)
        .set({
          content_type: contentType,
          status: 'verified',
          last_update_user_id: userId,
          last_update_timestamp: new Date(),
        })
        .where(
          and(
            eq(schemas.files.file_id, session.file_id),
            eq(schemas.files.status, 'pending'),
          ),
        )
        .returning();
      if (!verified) throw new ROOT_ERROR('数据异常');
      return verified;
    });
    await storage.remove(temporary).catch(() => undefined);
    logger.info(
      {
        event: 'upload.completed',
        sessionId,
        key: file.file_id,
        userId,
        durationMs: Date.now() - started,
      },
      '文件上传验证完成',
    );
    return toUploadedFile(verified);
  } catch (error) {
    const failed = await db.transaction(async (transaction) => {
      const failed = await transitionUploadSession(
        session,
        ['completing'],
        'failed',
        userId,
        transaction,
      );
      if (failed) {
        await transaction
          .update(schemas.files)
          .set({
            status: 'rejected',
            last_update_user_id: userId,
            last_update_timestamp: new Date(),
          })
          .where(eq(schemas.files.file_id, file.file_id));
      }
      return failed;
    });
    if (!failed) {
      // 提交回执丢失时事务可能已经完成，不能删除已发布的最终对象。
      const current = await requireUploadSession(sessionId, userId);
      if (current.session.status === 'completed')
        return toUploadedFile(current.file);
      throw error;
    }
    await storage
      .remove({ bucket: file.bucket, objectKey: file.object_key })
      .catch(() => undefined);
    logger.warn(
      {
        event: 'upload.complete_failed',
        sessionId,
        userId,
        durationMs: Date.now() - started,
      },
      '文件上传验证失败',
    );
    throw error;
  }
}

/** 取消尚未完成的传输；取消清理失败后允许重复调用继续清理。 */
async function abort(sessionId: string, userId: string): Promise<'ok'> {
  const { session, file } = await requireUploadSession(sessionId, userId);
  if (session.status !== 'canceled' && session.status !== 'expired') {
    const claimed = await transitionUploadSession(
      session,
      ['initialized', 'uploading', 'failed'],
      'canceled',
      userId,
    );
    if (!claimed)
      throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
  }
  if (session.upload_id) {
    await storage.abortMultipart({
      ...temporaryReference(file),
      uploadId: session.upload_id,
    });
  }
  await storage.remove(temporaryReference(file));
  logger.info(
    { event: 'upload.canceled', sessionId, userId },
    '文件上传已取消',
  );
  return 'ok';
}

/** 读取上传会话状态，不把业务绑定结果混入传输状态。 */
async function getStatus(
  sessionId: string,
  userId: string,
): Promise<UploadApi['status']['resp']> {
  const { session } = await requireUploadSession(sessionId, userId);
  return { status: session.status };
}

/** 有界回收失效且未验证的上传，保留所有已验证文件和仍在确认的会话。 */
async function cleanupExpired(): Promise<number> {
  const cutoff = new Date(
    Date.now() - uploadConfig.presignExpiresSeconds * 1000,
  );
  const candidates = await db
    .select({ session: schemas.file_upload_sessions, file: schemas.files })
    .from(schemas.file_upload_sessions)
    .innerJoin(
      schemas.files,
      eq(schemas.files.file_id, schemas.file_upload_sessions.file_id),
    )
    .where(
      and(
        lt(schemas.file_upload_sessions.expire_timestamp, cutoff),
        inArray(schemas.file_upload_sessions.status, [
          'initialized',
          'uploading',
          'failed',
          'canceled',
          'expired',
        ]),
        inArray(schemas.files.status, ['pending', 'rejected']),
      ),
    )
    .orderBy(asc(schemas.file_upload_sessions.expire_timestamp))
    .limit(100);
  let removed = 0;
  for (const { session, file } of candidates) {
    try {
      const claimed = await transitionUploadSession(
        session,
        ['initialized', 'uploading', 'failed', 'canceled', 'expired'],
        'expired',
        ROOT.SYS_ADMIN_USER_ID,
      );
      if (!claimed) continue;
      if (session.upload_id) {
        await storage.abortMultipart({
          ...temporaryReference(file),
          uploadId: session.upload_id,
        });
      }
      await removeObjects([file.file_id]);
      await db.transaction(
        async (transaction) => await deleteRecords([file.file_id], transaction),
      );
      removed++;
    } catch {
      logger.warn(
        {
          event: 'upload.expired_cleanup_failed',
          sessionId: session.session_id,
        },
        '过期上传清理失败，保留记录等待重试',
      );
    }
  }
  return removed;
}

/** 上传服务端生成内容，流会在用途大小上限内收集，验证成功后才发布句柄。 */
async function put(input: PutFileInput, userId: string): Promise<UploadedFile> {
  if (!userId) throw new ROOT_ERROR('非法参数');
  const policy = getUploadPolicy(input.purpose);
  let content: Buffer;
  if (input.content instanceof Uint8Array) {
    if (input.content.byteLength > policy.maxFileSizeBytes) {
      throw new ROOT_ERROR('文件上传: 文件大小超过限制');
    }
    content = Buffer.from(
      input.content.buffer,
      input.content.byteOffset,
      input.content.byteLength,
    );
  } else {
    content = await readStreamToBuffer(input.content, policy.maxFileSizeBytes);
  }
  const declaration = { ...input, size: content.length };
  const { filename, extension } = validateFileDeclaration(declaration);
  const contentType = await detectTrustedContentType(
    content.subarray(0, MAGIC_PREFIX_BYTES),
    filename,
    input.contentType,
  );
  if (!contentType) throw new ROOT_ERROR('文件上传: 文件内容与声明类型不匹配');
  const now = new Date();
  const key = randomUUID();
  const reference = {
    bucket: storage.bucket,
    objectKey: buildObjectKey(key, extension, now),
  };
  let inserting = false;
  try {
    await storage.put({ ...reference, content, contentType });
    inserting = true;
    const [stored] = await db
      .insert(schemas.files)
      .values({
        file_id: key,
        purpose: input.purpose,
        filename,
        extension,
        declared_content_type: input.contentType,
        content_type: contentType,
        size: content.length,
        bucket: reference.bucket,
        object_key: reference.objectKey,
        status: 'verified',
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .returning();
    if (!stored) throw new ROOT_ERROR('数据异常');
    return toUploadedFile(stored);
  } catch (error) {
    if (inserting) {
      // 文件行可能已提交，只是回执丢失；不能删除已发布对象。
      const [persisted] = await db
        .select()
        .from(schemas.files)
        .where(eq(schemas.files.file_id, key))
        .limit(1);
      if (persisted) return toUploadedFile(persisted);
    }
    await storage.remove(reference).catch(() => undefined);
    throw error;
  }
}

/** 获取已验证文件的安全元数据；业务访问授权由调用方负责。 */
async function getInfo(
  key: string,
  executor: FileReader = db,
): Promise<UploadedFile> {
  return toUploadedFile(await getStored(key, executor));
}

/** 业务绑定前检查文件可信状态、用途和所有权；管理员可以管理所有用户文件。 */
async function requireOwned(
  key: string,
  userId: string,
  executor: FileReader = db,
): Promise<UploadedFile> {
  const file = await getStored(key, executor);
  if (
    !userId ||
    (userId !== ROOT.SYS_ADMIN_USER_ID && file.create_user_id !== userId)
  ) {
    throw new ROOT_ERROR('相关文件不存在');
  }
  return toUploadedFile(file);
}

/** 为已经通过业务权限校验的文件生成短期 URL；此方法不是客户端授权入口。 */
async function getUrl(
  key: string,
  options: FileUrlOptions = {},
): Promise<FileAccess> {
  const results = await getUrls([key], options);
  return results.get(key)!;
}

/** 批量生成业务已授权文件的地址，列表与页面窗口不逐条查询文件表。 */
async function getUrls(
  keys: string[],
  options: FileUrlOptions = {},
): Promise<Map<string, FileAccess>> {
  const uniqueKeys = [...new Set(keys)];
  if (!uniqueKeys.length) return new Map();
  const expires =
    options.expiresInSeconds ?? uploadConfig.presignExpiresSeconds;
  if (
    !Number.isInteger(expires) ||
    expires <= 0 ||
    expires > uploadConfig.presignExpiresSeconds ||
    (options.disposition !== undefined &&
      options.disposition !== 'inline' &&
      options.disposition !== 'attachment')
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  const files = await db
    .select()
    .from(schemas.files)
    .where(inArray(schemas.files.file_id, uniqueKeys));
  if (files.length !== uniqueKeys.length)
    throw new ROOT_ERROR('相关文件不存在');
  return new Map(
    await Promise.all(
      files.map(async (file) => {
        const info = toUploadedFile(file);
        const access = await storage.presignGet({
          bucket: file.bucket,
          objectKey: file.object_key,
          contentType: info.contentType,
          filename: options.filename ?? info.filename,
          disposition: options.disposition ?? 'attachment',
          expiresInSeconds: expires,
        });
        return [info.key, access] as const;
      }),
    ),
  );
}

/** 打开已通过业务授权且完成验证的文件流。 */
async function open(key: string): Promise<Readable> {
  const file = await getStored(key);
  toUploadedFile(file);
  return await storage.open({
    bucket: file.bucket,
    objectKey: file.object_key,
  });
}

/** 为解析器提供不含物理位置的元数据与可重复打开的流工厂。 */
async function getReadableSource(key: string): Promise<ReadableFileSource> {
  return {
    ...(await getInfo(key)),
    openStream: async () => await open(key),
  };
}

/** 删除已由业务确认释放的对象，保留数据库记录供失败恢复与事务解除引用。 */
async function removeObjects(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const files = await db
    .select()
    .from(schemas.files)
    .where(inArray(schemas.files.file_id, keys));
  for (const file of files) {
    await storage.remove({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    await storage.remove(temporaryReference(file));
  }
}

/** 对象清理和业务引用解除后，在调用方事务中删除通用文件记录。 */
async function deleteRecords(
  keys: string[],
  transaction: DbTransaction,
): Promise<void> {
  if (!keys.length) return;
  await transaction
    .delete(schemas.file_upload_sessions)
    .where(inArray(schemas.file_upload_sessions.file_id, keys));
  await transaction
    .delete(schemas.files)
    .where(inArray(schemas.files.file_id, keys));
}

/** 清理已经确认无业务引用的文件，供未发布和被替换的预览产物使用。 */
async function remove(key: string): Promise<void> {
  await removeObjects([key]);
  await db.transaction(
    async (transaction) => await deleteRecords([key], transaction),
  );
}

/** 读取内部文件位置，此结果不能从模块公开出口返回。 */
async function getStored(
  key: string,
  executor: FileReader = db,
): Promise<StoredFile> {
  if (typeof key !== 'string' || !key) throw new ROOT_ERROR('非法参数');
  const [file] = await executor
    .select()
    .from(schemas.files)
    .where(eq(schemas.files.file_id, key))
    .limit(1);
  if (!file) throw new ROOT_ERROR('相关文件不存在');
  return file;
}

/** 根据会话当前状态重建上传入口，已完成会话不再签发写能力。 */
async function buildInitResponse(
  session: UploadSession,
): Promise<UploadApi['init']['resp']> {
  if (session.status === 'completed')
    return { mode: 'completed', sessionId: session.session_id };
  assertTransferableUploadSession(session);
  const file = await getStored(session.file_id);
  if (session.mode === 'single') {
    const uploadUrl = await storage.presignPut({
      ...temporaryReference(file),
      contentType: file.declared_content_type,
    });
    return {
      mode: 'single',
      sessionId: session.session_id,
      uploadUrl,
      headers: { 'Content-Type': file.declared_content_type },
    };
  }
  if (!session.upload_id || !session.part_size || !session.part_count)
    throw new ROOT_ERROR('数据异常');
  return {
    mode: 'multipart',
    sessionId: session.session_id,
    partSize: session.part_size,
  };
}

/** 验证已固化最终对象的大小和内容前缀，不信任客户端声明和临时对象。 */
async function validateStoredObject(file: StoredFile): Promise<string> {
  const reference = { bucket: file.bucket, objectKey: file.object_key };
  const head = await storage.head(reference);
  if (head.ContentLength !== file.size)
    throw new ROOT_ERROR('文件上传: 对象大小不匹配');
  const stream = await storage.open(reference);
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      const remaining = MAGIC_PREFIX_BYTES - total;
      chunks.push(buffer.subarray(0, remaining));
      total += Math.min(buffer.length, remaining);
      if (total >= MAGIC_PREFIX_BYTES) break;
    }
  } finally {
    stream.destroy();
  }
  const contentType = await detectTrustedContentType(
    Buffer.concat(chunks),
    file.filename,
    file.declared_content_type,
  );
  if (!contentType) throw new ROOT_ERROR('文件上传: 文件内容与声明类型不匹配');
  return contentType;
}

/** 构造仅由服务端控制、不可被客户端指定的最终对象位置。 */
function buildObjectKey(key: string, extension: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `files/${year}/${month}/${key}/${randomUUID()}.${extension}`;
}

/** 从最终位置派生只用于客户端直传的临时路径。 */
function temporaryObjectKey(objectKey: string): string {
  return `temporary/${objectKey}`;
}

/** 从内部文件记录得到临时对象位置。 */
function temporaryReference(file: StoredFile) {
  return {
    bucket: file.bucket,
    objectKey: temporaryObjectKey(file.object_key),
  };
}

/** 将已验证内部文件转换为不含存储位置的稳定描述。 */
function toUploadedFile(file: StoredFile): UploadedFile {
  if (file.status !== 'verified' || !file.content_type)
    throw new ROOT_ERROR('数据异常');
  return {
    key: file.file_id,
    filename: file.filename,
    extension: file.extension,
    contentType: file.content_type,
    size: file.size,
    purpose: file.purpose,
  };
}

type UploadSession = typeof schemas.file_upload_sessions.$inferSelect;

const MAGIC_PREFIX_BYTES = 1024 * 1024;
const illegalFilenameChars = /[<>:"/\\|?*]/g;
// eslint-disable-next-line no-control-regex -- 清洗文件名中的控制字符
const controlChars = /[\u0000-\u001F\u007F-\u009F]/g;

/** 按用户读取会话和文件。管理员不限创建人。 */
async function requireUploadSession(
  sessionId: string,
  userId: string,
  executor: FileReader = db,
) {
  if (!sessionId || !userId) throw new ROOT_ERROR('非法参数');
  let owner;
  if (userId !== ROOT.SYS_ADMIN_USER_ID) {
    owner = eq(schemas.file_upload_sessions.create_user_id, userId);
  }
  const [row] = await executor
    .select({ session: schemas.file_upload_sessions, file: schemas.files })
    .from(schemas.file_upload_sessions)
    .innerJoin(
      schemas.files,
      eq(schemas.files.file_id, schemas.file_upload_sessions.file_id),
    )
    .where(and(eq(schemas.file_upload_sessions.session_id, sessionId), owner))
    .limit(1);
  if (!row) throw new ROOT_ERROR('相关文件不存在');
  return row;
}

/** 只有当前状态还在 expected 里才改状态，避免后到的请求覆盖完成结果。 */
async function transitionUploadSession(
  session: UploadSession,
  expected: UploadSessionStatus[],
  status: UploadSessionStatus,
  userId: string,
  executor: Pick<typeof db, 'update'> = db,
) {
  const [updated] = await executor
    .update(schemas.file_upload_sessions)
    .set({
      status,
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.file_upload_sessions.session_id, session.session_id),
        inArray(schemas.file_upload_sessions.status, expected),
      ),
    )
    .returning();
  return updated;
}

/** 过期、正在确认或已经结束的会话不再签发写地址。 */
function assertTransferableUploadSession(session: UploadSession) {
  if (session.expire_timestamp.getTime() <= Date.now()) {
    throw new ROOT_ERROR('文件上传: 上传会话已过期，请重新选择文件');
  }
  if (session.status === 'completing') {
    throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
  }
  if (session.status !== 'initialized' && session.status !== 'uploading') {
    throw new ROOT_ERROR('文件上传: 上传会话已结束，请重新选择文件');
  }
}

/** 按用途检查文件名、大小和声明类型。 */
function validateFileDeclaration(input: {
  filename: string;
  contentType: string;
  size: number;
  purpose: FilePurpose;
}) {
  const policy = getUploadPolicy(input.purpose);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new ROOT_ERROR('文件上传: 文件不能为空');
  }
  if (input.size > policy.maxFileSizeBytes) {
    throw new ROOT_ERROR('文件上传: 文件大小超过限制');
  }
  if (
    typeof input.filename !== 'string' ||
    typeof input.contentType !== 'string'
  ) {
    throw new ROOT_ERROR('非法参数');
  }
  const filename =
    input.filename
      .trim()
      .replace(illegalFilenameChars, '_')
      .replace(controlChars, '_')
      .slice(0, 255) || 'file';
  const extension = getFileExtension(filename);
  if (!extension) throw new ROOT_ERROR('文件上传: 文件类型不受支持');
  const format = contentTypesByExtension[extension];
  if (
    !policy.allowedTypes.includes(format.type) ||
    !format.mime.includes(input.contentType)
  ) {
    throw new ROOT_ERROR('文件上传: 文件类型不受支持');
  }
  return { filename, extension };
}

/** 按 S3 默认的最小片和最多 10000 片计算分片。 */
function calculateMultipartPlan(fileSize: number) {
  const step = 1024 * 1024;
  const required = Math.max(
    5 * step,
    uploadConfig.partSizeBytes,
    Math.ceil(fileSize / 10_000),
  );
  const partSize = Math.ceil(required / step) * step;
  return { partSize, partCount: Math.ceil(fileSize / partSize) };
}

/** 用文件头判断真实类型。对不上声明时返回空。 */
async function detectTrustedContentType(
  prefix: Buffer,
  filename: string,
  declaredContentType: string,
) {
  const extension = getFileExtension(filename);
  if (!extension) return undefined;
  const format = contentTypesByExtension[extension];
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(prefix);
  } catch {
    return undefined;
  }
  if (detected) {
    if (!format.mime.includes(detected.mime)) return undefined;
    return format.mime[0];
  }
  if (format.type !== 'text' || !format.mime.includes(declaredContentType)) {
    return undefined;
  }
  // 前缀刚好截断多字节字符时，丢掉末尾最多 3 个字节再判断 UTF-8。
  let text = prefix;
  if (prefix.length === MAGIC_PREFIX_BYTES) {
    for (let trim = 0; trim <= 3; trim++) {
      text = prefix.subarray(0, prefix.length - trim);
      if (isUtf8(text)) break;
    }
  }
  if (!isUtf8(text) || text.includes(0)) return undefined;
  return format.mime[0];
}

/** 服务端统一的通用文件能力，业务层负责授予读取和物理清理权限。 */

export const upload = {
  checkBucket,
  initialize,
  signPart,
  listParts,
  complete,
  abort,
  getStatus,
  cleanupExpired,
  put,
  getInfo,
  requireOwned,
  getUrl,
  getUrls,
  open,
  getReadableSource,
  removeObjects,
  deleteRecords,
  remove,
};
