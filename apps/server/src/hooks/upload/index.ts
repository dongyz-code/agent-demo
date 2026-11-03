import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, lt } from 'drizzle-orm';

import { logger, ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, pgAdvisoryXactLock, schemas } from '@/database/index.js';
import { readStreamToBuffer } from '@/utils/index.js';
import { getUploadPolicy, uploadConfig } from './config.js';
import {
  assertTransferableUploadSession,
  publishVerifiedFile,
  requireUploadSession,
  transitionUploadSession,
} from './session.js';
import { S3ObjectStorage } from './storage.js';
import {
  calculateMultipartPlan,
  detectTrustedContentType,
  MAGIC_PREFIX_BYTES,
  validateFileDeclaration,
} from './validation.js';

import type { Readable } from 'node:stream';
import type { DbTransaction } from '@/database/index.js';
import type {
  FileAccess,
  UploadedFile,
  Upload as UploadApi,
  UploadMode,
} from '@repo/types';
import type { UploadSession } from './session.js';
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

/** 通用文件能力；调用方先完成业务授权，所有物理对象位置只在此模块内使用。 */
class Upload {
  /** 内部存储适配器，通过组合避免向调用方暴露 Bucket 和对象命令。 */
  private readonly storage = new S3ObjectStorage(
    ROOT.storage.s3,
    uploadConfig.presignExpiresSeconds,
  );

  /**
   * 启动期检查私有存储可访问性。
   *
   * @returns 默认 Bucket 可访问时结束。
   */
  async checkBucket(): Promise<void> {
    await this.storage.checkBucket();
  }

  /**
   * 初始化或幂等恢复客户端直传，会话仅保存文件传输信息。
   *
   * @param input 文件声明、受控用途与一次上传尝试的幂等键。
   * @param userId 当前认证用户，用于会话所有权和审计。
   * @returns 仅能写入临时对象的普通上传签名或分片会话。
   */
  async initialize(
    input: UploadApi['init']['body'],
    userId: string,
  ): Promise<UploadApi['init']['resp']> {
    if (
      !userId ||
      !input ||
      !['attachment', 'document', 'avatar'].includes(input.purpose)
    ) {
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
          if (
            existing.file.filename !== filename ||
            existing.file.size !== input.size ||
            existing.file.declared_content_type !== input.contentType ||
            existing.file.purpose !== input.purpose
          ) {
            throw new ROOT_ERROR('非法参数');
          }
          return existing.session;
        }
        const now = new Date();
        const fileId = randomUUID();
        createdFileId = fileId;
        const objectKey = buildObjectKey(fileId, extension, now);
        const bucket = this.storage.bucket;
        let mode: UploadMode = 'single';
        let plan;
        if (input.size >= uploadConfig.multipartThresholdBytes) {
          mode = 'multipart';
          plan = calculateMultipartPlan(input.size, uploadConfig.partSizeBytes);
        }
        let uploadId: string | undefined;
        if (mode === 'multipart') {
          const temporary = {
            bucket,
            objectKey: temporaryObjectKey(objectKey),
          };
          uploadId = await this.storage.createMultipart({
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
          await this.storage
            .abortMultipart(createdMultipart)
            .catch(() => undefined);
      }
      throw error;
    }
    const result = await this.buildInitResponse(session);
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

  /**
   * 为当前用户的有效 Multipart 会话签名一个分片。
   *
   * @param input 会话标识和从 1 开始的分片编号。
   * @param userId 当前认证用户。
   * @returns 指向指定临时分片的短期写入地址。
   */
  async signPart(
    input: UploadApi['sign-parts']['body'],
    userId: string,
  ): Promise<UploadApi['sign-parts']['resp']> {
    const { session, file } = await requireUploadSession(
      input.sessionId,
      userId,
    );
    assertTransferableUploadSession(session);
    if (
      session.mode !== 'multipart' ||
      !session.upload_id ||
      !session.part_count ||
      !Number.isInteger(input.partNumber) ||
      input.partNumber < 1 ||
      input.partNumber > session.part_count
    ) {
      throw new ROOT_ERROR('非法参数');
    }
    const uploadUrl = await this.storage.presignPart({
      ...temporaryReference(file),
      uploadId: session.upload_id,
      partNumber: input.partNumber,
    });
    logger.debug(
      {
        event: 'upload.part_signed',
        sessionId: session.session_id,
        partNumber: input.partNumber,
        userId,
      },
      '上传分片签名已生成',
    );
    return { uploadUrl };
  }

  /**
   * 读取真实分片并原子推进传输状态，供刷新与断点恢复使用。
   *
   * @param sessionId 当前用户可操作的会话标识。
   * @param userId 当前认证用户。
   * @returns 对象存储实际接收的分片列表。
   */
  async listParts(
    sessionId: string,
    userId: string,
  ): Promise<UploadApi['list-parts']['resp']> {
    const { session, file } = await requireUploadSession(sessionId, userId);
    assertTransferableUploadSession(session);
    if (session.mode !== 'multipart' || !session.upload_id)
      return { parts: [] };
    const parts = await this.storage.listParts({
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

  /**
   * 固化并验证上传对象，文件可信状态与会话完成状态原子发布。
   *
   * @param sessionId 当前用户可操作的会话标识。
   * @param userId 当前认证用户。
   * @returns 幂等的文件句柄与可信元数据，不执行任何业务绑定。
   */
  async complete(sessionId: string, userId: string): Promise<UploadedFile> {
    const { session, file } = await requireUploadSession(sessionId, userId);
    if (session.status === 'completed') return toUploadedFile(file);
    assertTransferableUploadSession(session);
    const claimed = await transitionUploadSession(
      session,
      ['initialized', 'uploading'],
      'completing',
      userId,
    );
    if (!claimed)
      throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
    const started = Date.now();
    const temporary = temporaryReference(file);
    try {
      if (session.mode === 'multipart') {
        if (!session.upload_id || !session.part_count || !session.part_size)
          throw new ROOT_ERROR('非法参数');
        const reference = { ...temporary, uploadId: session.upload_id };
        const parts = await this.storage.listParts(reference);
        const invalid = parts.some((part, index) => {
          const expectedSize = Math.min(
            session.part_size!,
            file.size - index * session.part_size!,
          );
          return part.partNumber !== index + 1 || part.size !== expectedSize;
        });
        if (parts.length !== session.part_count || invalid) {
          throw new ROOT_ERROR('文件上传: 文件分片校验不匹配，请重新上传');
        }
        await this.storage.completeMultipart({ ...reference, parts });
      }
      const finalReference = {
        bucket: file.bucket,
        objectKey: file.object_key,
      };
      await this.storage.copy(temporary, finalReference);
      const contentType = await this.validateStoredObject(file);
      const verified = await db.transaction(
        async (transaction) =>
          await publishVerifiedFile(transaction, session, contentType, userId),
      );
      await this.storage.remove(temporary).catch(() => undefined);
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
      await this.storage
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

  /**
   * 取消尚未完成的传输；取消清理失败后允许重复调用继续清理。
   *
   * @param sessionId 当前用户可操作的会话标识。
   * @param userId 当前认证用户。
   * @returns 取消与临时对象清理完成后返回 ok。
   */
  async abort(sessionId: string, userId: string): Promise<'ok'> {
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
      await this.storage.abortMultipart({
        ...temporaryReference(file),
        uploadId: session.upload_id,
      });
    }
    await this.storage.remove(temporaryReference(file));
    logger.info(
      { event: 'upload.canceled', sessionId, userId },
      '文件上传已取消',
    );
    return 'ok';
  }

  /**
   * 读取上传会话状态，不把业务绑定结果混入传输状态。
   *
   * @param sessionId 当前用户可操作的会话标识。
   * @param userId 当前认证用户。
   * @returns 当前数据库中的上传状态。
   */
  async getStatus(
    sessionId: string,
    userId: string,
  ): Promise<UploadApi['status']['resp']> {
    const { session } = await requireUploadSession(sessionId, userId);
    return { status: session.status };
  }

  /**
   * 有界回收失效且未验证的上传，保留所有已验证文件和仍在确认的会话。
   *
   * 过期后额外等待最长签名有效时间，避免旧写地址在清理后重新创建对象。
   *
   * @returns 本次成功回收的会话数量；失败项保留数据库线索供下次重试。
   */
  async cleanupExpired(): Promise<number> {
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
          await this.storage.abortMultipart({
            ...temporaryReference(file),
            uploadId: session.upload_id,
          });
        }
        await this.removeObjects([file.file_id]);
        await db.transaction(
          async (transaction) =>
            await this.deleteRecords([file.file_id], transaction),
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

  /**
   * 上传服务端生成内容，流会在用途大小上限内收集，验证成功后才发布句柄。
   *
   * @param input 文件内容、显示名、MIME 与服务端用途。
   * @param userId 内容归属用户，用于业务绑定和审计。
   * @returns 已验证文件描述，失败时删除本次写入的对象。
   */
  async put(input: PutFileInput, userId: string): Promise<UploadedFile> {
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
      content = await readStreamToBuffer(
        input.content,
        policy.maxFileSizeBytes,
      );
    }
    const declaration = { ...input, size: content.length };
    const { filename, extension } = validateFileDeclaration(declaration);
    const contentType = await detectTrustedContentType(
      content.subarray(0, MAGIC_PREFIX_BYTES),
      filename,
      input.contentType,
    );
    if (!contentType)
      throw new ROOT_ERROR('文件上传: 文件内容与声明类型不匹配');
    const now = new Date();
    const key = randomUUID();
    const reference = {
      bucket: this.storage.bucket,
      objectKey: buildObjectKey(key, extension, now),
    };
    let inserting = false;
    try {
      await this.storage.put({ ...reference, content, contentType });
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
      await this.storage.remove(reference).catch(() => undefined);
      throw error;
    }
  }

  /**
   * 获取已验证文件的安全元数据；业务访问授权由调用方负责。
   *
   * @param key upload 提供的文件句柄。
   * @param executor 可选业务事务，保证绑定检查读取同一事务。
   * @returns 不包含物理位置的可信文件描述。
   */
  async getInfo(key: string, executor: FileReader = db): Promise<UploadedFile> {
    return toUploadedFile(await this.getStored(key, executor));
  }

  /**
   * 业务绑定前检查文件可信状态、用途和所有权；管理员可以管理所有用户文件。
   *
   * @param key 待绑定文件句柄。
   * @param userId 当前认证用户。
   * @param executor 可选业务事务。
   * @returns 已授权的文件元数据，调用方继续检查具体用途。
   */
  async requireOwned(
    key: string,
    userId: string,
    executor: FileReader = db,
  ): Promise<UploadedFile> {
    const file = await this.getStored(key, executor);
    if (
      !userId ||
      (userId !== ROOT.SYS_ADMIN_USER_ID && file.create_user_id !== userId)
    ) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    return toUploadedFile(file);
  }

  /**
   * 为已经通过业务权限校验的文件生成短期 URL；此方法不是客户端授权入口。
   *
   * @param key 已授权文件句柄。
   * @param options 下载方式、显示文件名和受限有效秒数。
   * @returns 可临时缓存的 URL 与失效时间。
   */
  async getUrl(key: string, options: FileUrlOptions = {}): Promise<FileAccess> {
    const results = await this.getUrls([key], options);
    return results.get(key)!;
  }

  /**
   * 批量生成业务已授权文件的地址，列表与页面窗口不逐条查询文件表。
   *
   * @param keys 已经过业务权限过滤的文件句柄集合。
   * @param options 所有文件共用的访问方式与有效期。
   * @returns 以文件句柄索引的短期访问结果。
   */
  async getUrls(
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
          const access = await this.storage.presignGet({
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

  /**
   * 打开已通过业务授权且完成验证的文件流。
   *
   * @param key 已授权文件句柄。
   * @returns 每次调用创建的新对象读取流，调用方负责消费或关闭。
   */
  async open(key: string): Promise<Readable> {
    const file = await this.getStored(key);
    toUploadedFile(file);
    return await this.storage.open({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
  }

  /**
   * 为解析器提供不含物理位置的元数据与可重复打开的流工厂。
   *
   * @param key 已通过业务授权的文件句柄。
   * @returns 可信元数据与每次均创建新流的读取函数。
   */
  async getReadableSource(key: string): Promise<ReadableFileSource> {
    return {
      ...(await this.getInfo(key)),
      openStream: async () => await this.open(key),
    };
  }

  /**
   * 删除已由业务确认释放的对象，保留数据库记录供失败恢复与事务解除引用。
   *
   * @param keys 已确认可以清理的文件句柄，不能直接取自不可信客户端。
   * @returns 全部对象删除成功后结束；任何失败都保留文件记录。
   */
  async removeObjects(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const files = await db
      .select()
      .from(schemas.files)
      .where(inArray(schemas.files.file_id, keys));
    for (const file of files) {
      await this.storage.remove({
        bucket: file.bucket,
        objectKey: file.object_key,
      });
      await this.storage.remove(temporaryReference(file));
    }
  }

  /**
   * 对象清理和业务引用解除后，在调用方事务中删除通用文件记录。
   *
   * @param keys 已成功清理对象且解除业务引用的文件句柄。
   * @param transaction 调用方的业务事务，不能绕过引用解除步骤。
   * @returns 文件与其上传会话记录均删除后结束。
   */
  async deleteRecords(
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

  /**
   * 清理已经确认无业务引用的文件，供未发布和被替换的预览产物使用。
   *
   * @param key 服务端确认不再使用的文件句柄。
   * @returns 对象删除成功并移除文件记录后结束。
   */
  async remove(key: string): Promise<void> {
    await this.removeObjects([key]);
    await db.transaction(
      async (transaction) => await this.deleteRecords([key], transaction),
    );
  }

  /**
   * 读取内部文件位置，此结果不能从模块公开出口返回。
   *
   * @param key 待读取文件句柄。
   * @param executor 默认数据库或外层事务。
   * @returns 内部文件记录，不存在时抛出统一错误。
   */
  private async getStored(
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

  /**
   * 根据会话当前状态重建上传入口，已完成会话不再签发写能力。
   *
   * @param session 通过所有权检查的会话。
   * @returns 终态描述或尚可传输的临时对象入口。
   */
  private async buildInitResponse(
    session: UploadSession,
  ): Promise<UploadApi['init']['resp']> {
    if (session.status === 'completed')
      return { mode: 'completed', sessionId: session.session_id };
    assertTransferableUploadSession(session);
    const file = await this.getStored(session.file_id);
    if (session.mode === 'single') {
      const uploadUrl = await this.storage.presignPut({
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

  /**
   * 验证已固化最终对象的大小和内容前缀，不信任客户端声明和临时对象。
   *
   * @param file 初始化时冻结的文件元数据与最终位置。
   * @returns 服务端识别的规范 MIME。
   */
  private async validateStoredObject(file: StoredFile): Promise<string> {
    const reference = { bucket: file.bucket, objectKey: file.object_key };
    const head = await this.storage.head(reference);
    if (head.ContentLength !== file.size)
      throw new ROOT_ERROR('文件上传: 对象大小不匹配');
    const stream = await this.storage.open(reference);
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
    if (!contentType)
      throw new ROOT_ERROR('文件上传: 文件内容与声明类型不匹配');
    return contentType;
  }
}

/**
 * 构造仅由服务端控制、不可被客户端指定的最终对象位置。
 *
 * @param key 稳定文件句柄。
 * @param extension 已验证的规范扩展名。
 * @param now 当前日期，用于 UTC 分区。
 * @returns 不包含用户文件名的最终对象路径。
 */
function buildObjectKey(key: string, extension: string, now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `files/${year}/${month}/${key}/${randomUUID()}.${extension}`;
}

/**
 * 从最终位置派生只用于客户端直传的临时路径。
 *
 * @param objectKey 服务端生成的最终对象路径。
 * @returns 即使旧 PUT 仍有效也无法覆盖最终对象的隔离路径。
 */
function temporaryObjectKey(objectKey: string): string {
  return `temporary/${objectKey}`;
}

/**
 * 从内部文件记录得到临时对象位置。
 *
 * @param file 初始化时保存的内部文件记录。
 * @returns 仅供存储适配器使用的临时位置。
 */
function temporaryReference(file: StoredFile) {
  return {
    bucket: file.bucket,
    objectKey: temporaryObjectKey(file.object_key),
  };
}

/**
 * 将已验证内部文件转换为不含存储位置的稳定描述。
 *
 * @param file 内部文件记录。
 * @returns 可交给业务或客户端保存的文件描述。
 */
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

/** 服务端统一的通用文件能力，业务层负责授予读取和物理清理权限。 */
export const upload = new Upload();
