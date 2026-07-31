import { eq, inArray } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';

import { logger, ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { contentTypesByExtension, getFileExtension } from '@repo/shared';
import { createDocumentVersionFromFile } from '../document/version.js';
import { createDocumentPreviewTask } from '../preview/task.js';
import {
  completeMultipartUpload,
  headStoredObject,
  listMultipartParts,
  openStoredObject,
} from './objects.js';
import { getUploadPolicy } from './policies.js';
import {
  assertTransferableUploadSession,
  getOwnedUploadSession,
} from './session.js';
import { getStoredFile } from './source.js';

import type { Upload } from '@repo/types';
import type { SupportedFileExtension } from '@repo/shared';

/** 文件签名检测读取的最大前缀，足以覆盖常见格式识别。 */
const MAGIC_PREFIX_BYTES = 8192;
/** 没有稳定 Magic Number、允许按扩展名和声明 MIME 回退的文本格式。 */
const TEXT_EXTENSIONS: readonly SupportedFileExtension[] = ['txt', 'md', 'csv'];

/** 文件内容验证器输入。 */
interface FileValidationInput {
  /** 文件前缀字节。 */
  prefix: Buffer;
  /** 用户上传时提供的文件名，用于约束签名识别范围。 */
  filename: string;
  /** 初始化时声明的 MIME。 */
  declaredContentType: string;
}

/**
 * 完成对象上传、创建文档版本并触发预览与版本内容任务。
 *
 * @param input 上传会话标识。
 * @param userId 当前操作用户，用于会话所有权、文档范围和审计。
 * @returns 新建或复用的文档版本结果。
 */
export async function completeDocumentUpload(
  input: Upload['complete']['body'],
  userId: string,
): Promise<Upload['complete']['resp']> {
  const session = await getOwnedUploadSession(input.sessionId, userId);
  const file = await finishUpload(session, userId);
  const binding = await createDocumentVersionFromFile(
    {
      fileId: file.file_id,
      documentId: session.document_id ?? undefined,
      name: file.filename,
      ragEnabled: false,
    },
    userId,
  );
  try {
    await createDocumentPreviewTask(
      {
        documentId: binding.document.documentId,
        documentVersionId: binding.documentVersionId,
        triggerSource: 'upload',
      },
      userId,
    );
  } catch (error) {
    let message = '预览任务创建失败';
    if (error instanceof Error) message = error.message;
    await db
      .update(schemas.document_versions)
      .set({
        preview_status: 'failed',
        preview_error: message,
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(
        eq(
          schemas.document_versions.document_version_id,
          binding.documentVersionId,
        ),
      )
      .catch(() => undefined);
    logger.error(
      {
        event: 'documents.upload.preview_schedule_failed',
        documentId: binding.document.documentId,
        documentVersionId: binding.documentVersionId,
        error,
      },
      '文档已入库，但预览任务创建失败',
    );
  }
  return {
    documentId: binding.document.documentId,
    documentVersionId: binding.documentVersionId,
    version: binding.version,
    created: binding.created,
  };
}

/** 幂等完成上传并返回已验证源文件行。 */
async function finishUpload(
  session: typeof schemas.file_upload_sessions.$inferSelect,
  userId: string,
) {
  if (session.status === 'completed') {
    return await getStoredFile(session.file_id);
  }
  if (session.status === 'completing') {
    throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
  }
  assertTransferableUploadSession(session);

  const where = buildWhere((filter) => {
    filter.push(
      eq(schemas.file_upload_sessions.session_id, session.session_id),
      inArray(schemas.file_upload_sessions.status, [
        'initialized',
        'uploading',
      ]),
    );
  });
  const [claimed] = await db
    .update(schemas.file_upload_sessions)
    .set({
      status: 'completing',
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(where)
    .returning();
  if (!claimed) {
    throw new ROOT_ERROR('数据异常');
  }

  const file = await getStoredFile(session.file_id);
  try {
    if (session.mode === 'multipart') {
      if (!session.upload_id || !session.part_count) {
        throw new ROOT_ERROR('非法参数');
      }
      const actualParts = await listMultipartParts({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id,
      });
      const hasInvalidPart = actualParts.some(
        (part, index) => part.partNumber !== index + 1,
      );
      if (actualParts.length !== session.part_count || hasInvalidPart) {
        throw new ROOT_ERROR('非法参数');
      }
      await completeMultipartUpload({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id,
        parts: actualParts,
      });
    }

    const verified = await validateStoredFile(file, session, userId);
    await db
      .update(schemas.file_upload_sessions)
      .set({
        status: 'completed',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schemas.file_upload_sessions.session_id, session.session_id));
    return verified;
  } catch (error) {
    await db
      .update(schemas.file_upload_sessions)
      .set({
        status: 'failed',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schemas.file_upload_sessions.session_id, session.session_id));
    throw error;
  }
}

/** 验证上传完成后的对象并写入可信文件信息。 */
async function validateStoredFile(
  file: typeof schemas.files.$inferSelect,
  session: typeof schemas.file_upload_sessions.$inferSelect,
  userId: string,
) {
  try {
    const head = await headStoredObject({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    if (head.ContentLength !== file.size) {
      throw new ROOT_ERROR('文件上传: 对象大小不匹配');
    }

    const prefix = await readObjectPrefix({
      bucket: file.bucket,
      objectKey: file.object_key,
      limit: MAGIC_PREFIX_BYTES,
    });
    const trustedContentType = await detectTrustedContentType({
      prefix,
      filename: file.filename,
      declaredContentType: file.declared_content_type,
    });
    const policy = getUploadPolicy(session.policy_key);
    if (
      !trustedContentType ||
      !policy.allowedContentTypes.includes(trustedContentType)
    ) {
      throw new ROOT_ERROR('文件上传: 文件内容与声明类型不匹配');
    }

    const now = new Date();
    const [updated] = await db
      .update(schemas.files)
      .set({
        content_type: trustedContentType,
        status: 'verified',
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(eq(schemas.files.file_id, file.file_id))
      .returning();
    if (!updated) throw new Error('文件验证结果写入失败');
    return updated;
  } catch (error) {
    await db
      .update(schemas.files)
      .set({
        status: 'rejected',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schemas.files.file_id, file.file_id));
    throw error;
  }
}

/** 读取对象前缀，达到上限后主动结束当前流。 */
async function readObjectPrefix({
  bucket,
  objectKey,
  limit,
}: {
  bucket: string;
  objectKey: string;
  limit: number;
}) {
  const stream = await openStoredObject({ bucket, objectKey });
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const remaining = limit - total;
    chunks.push(buffer.subarray(0, remaining));
    total += Math.min(buffer.length, remaining);
    if (total >= limit) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks);
}

/**
 * 使用文件签名识别可信 MIME。
 *
 * 文本格式通常没有稳定 Magic Number，仅允许受策略约束的 text 声明回退。
 *
 * @param input 文件前缀与客户端声明 MIME。
 * @returns 二进制签名识别结果、允许的文本回退或空。
 */
async function detectTrustedContentType(input: FileValidationInput) {
  const extension = getFileExtension(input.filename);
  if (!extension) return undefined;
  const compatibleContentTypes: readonly string[] =
    contentTypesByExtension[extension];

  const detected = await fileTypeFromBuffer(input.prefix);
  if (detected?.mime) {
    if (!compatibleContentTypes.includes(detected.mime)) return undefined;
    return compatibleContentTypes[0];
  }
  if (!TEXT_EXTENSIONS.includes(extension)) return undefined;
  if (!compatibleContentTypes.includes(input.declaredContentType)) {
    return undefined;
  }
  return compatibleContentTypes[0];
}
