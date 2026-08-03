import { randomUUID } from 'node:crypto';
import { eq, ne } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { contentTypesByExtension, getFileExtension } from '@repo/shared';
import { documentsConfig } from '../config.js';
import { objectStorage } from './objects.js';
import { getStoredFile } from './source.js';

import type { Upload, UploadMode } from '@repo/types';
import type { SupportedFileExtension } from '@repo/shared';

/** S3 Multipart 最小分片大小。 */
const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024;
/** S3 Multipart 最大分片数量。 */
const MAX_MULTIPART_PART_COUNT = 10_000;
/** 分片大小向上取整粒度，便于观察与运维。 */
const MULTIPART_PART_SIZE_STEP = 1024 * 1024;

/** 文件名中不允许保留的路径分隔符和跨平台特殊字符。 */
const illegalFilenameChars = /[<>:"/\\|?*]/g;
// eslint-disable-next-line no-control-regex -- 文件名清洗需要匹配 C0/C1 控制字符
const controlChars = /[\u0000-\u001F\u007F-\u009F]/g;

/** 后端确定并持久化的 Multipart 分片方案。 */
interface MultipartPlan {
  /** 每个非末尾分片的目标字节数。 */
  partSize: number;
  /** 文件按目标大小切分后的分片总数。 */
  partCount: number;
}

/**
 * 初始化文档的普通或 Multipart 上传流程。
 *
 * @param input 客户端上传声明、文档意图和幂等信息。
 * @param userId 当前操作用户，用于文档范围与上传会话所有权。
 * @returns 普通上传签名或 Multipart 会话描述。
 */
export async function initializeDocumentUpload(
  input: Upload['init']['body'],
  userId: string,
): Promise<Upload['init']['resp']> {
  if (input.documentId) {
    await assertUploadTargetDocument(input.documentId, userId);
  }
  const filename = sanitizeUploadFilename(input.filename);
  const extension = getFileExtension(filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new ROOT_ERROR('文件上传: 文件不能为空');
  }
  if (input.size > documentsConfig.upload.maxFileSizeBytes) {
    throw new ROOT_ERROR('文件上传: 文件大小超过限制');
  }
  if (!extension) {
    throw new ROOT_ERROR('文件上传: 文件类型不受支持');
  }
  const contentType = contentTypesByExtension[extension];
  if (!contentType.mime.includes(input.contentType)) {
    throw new ROOT_ERROR('文件上传: 文件类型不受支持');
  }

  const where = buildWhere((filter) => {
    filter.push(
      eq(schemas.file_upload_sessions.create_user_id, userId),
      eq(schemas.file_upload_sessions.idempotency_key, input.idempotencyKey),
    );
  });
  const [existing] = await db
    .select()
    .from(schemas.file_upload_sessions)
    .where(where)
    .limit(1);
  if (existing) {
    return await buildInitResponse(existing);
  }

  const now = new Date();
  const fileId = randomUUID();
  const sessionId = randomUUID();
  const objectKey = buildObjectKey({ fileId, extension, now });
  const bucket = objectStorage.bucket;
  let mode: UploadMode = 'single';
  let multipart: MultipartPlan | undefined;
  if (input.size >= documentsConfig.upload.multipartThresholdBytes) {
    mode = 'multipart';
    multipart = calculateMultipartPlan(
      input.size,
      documentsConfig.upload.partSizeBytes,
    );
  }
  let uploadId: string | undefined;
  if (mode === 'multipart') {
    uploadId = await objectStorage.createMultipart({
      bucket,
      objectKey,
      contentType: input.contentType,
    });
  }

  let created: typeof schemas.file_upload_sessions.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      await tx.insert(schemas.files).values({
        file_id: fileId,
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
      const [session] = await tx
        .insert(schemas.file_upload_sessions)
        .values({
          session_id: sessionId,
          file_id: fileId,
          document_id: input.documentId ?? null,
          idempotency_key: input.idempotencyKey,
          mode,
          upload_id: uploadId ?? null,
          part_size: multipart?.partSize ?? null,
          part_count: multipart?.partCount ?? null,
          status: 'initialized',
          expire_timestamp: new Date(
            now.getTime() + documentsConfig.upload.sessionExpiresSeconds * 1000,
          ),
          create_user_id: userId,
          create_timestamp: now,
          last_update_user_id: userId,
          last_update_timestamp: now,
        })
        .returning();
      if (!session) throw new Error('上传会话创建后无法读取');
      return session;
    });
  } catch (error) {
    if (uploadId) {
      await objectStorage.abortMultipart({
        bucket,
        objectKey,
        uploadId,
      }).catch(() => undefined);
    }
    throw error;
  }

  return await buildInitResponse(created);
}

/**
 * 校验上传新版本的目标文档存在且属于当前用户。
 *
 * @param documentId 目标文档标识。
 * @param userId 当前操作用户，用于限制文档范围。
 * @returns 校验通过时无返回值。
 */
async function assertUploadTargetDocument(
  documentId: string,
  userId: string,
): Promise<void> {
  const where = buildWhere((filter) => {
    filter.push(
      eq(schemas.documents.document_id, documentId),
      eq(schemas.documents.create_user_id, userId),
      ne(schemas.documents.status, 'deleted'),
    );
  });
  const [document] = await db
    .select({ id: schemas.documents.document_id })
    .from(schemas.documents)
    .where(where)
    .limit(1);
  if (!document) {
    throw new ROOT_ERROR('相关文件不存在');
  }
}

/** 根据现有上传会话重建初始化响应与短期签名。 */
async function buildInitResponse(
  session: typeof schemas.file_upload_sessions.$inferSelect,
): Promise<Upload['init']['resp']> {
  if (session.status === 'completed') {
    return {
      mode: 'completed',
      sessionId: session.session_id,
    };
  }
  if (session.expire_timestamp.getTime() <= Date.now()) {
    throw new ROOT_ERROR('文件上传: 上传会话已过期，请重新选择文件');
  }
  if (session.status === 'completing') {
    throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
  }
  if (['failed', 'canceled', 'expired'].includes(session.status)) {
    throw new ROOT_ERROR('文件上传: 上传会话已结束，请重新选择文件');
  }
  const file = await getStoredFile(session.file_id);
  if (session.mode === 'single') {
    const uploadUrl = await objectStorage.presignPut({
      bucket: file.bucket,
      objectKey: file.object_key,
      contentType: file.declared_content_type,
    });
    return {
      mode: 'single',
      sessionId: session.session_id,
      uploadUrl,
      headers: { 'Content-Type': file.declared_content_type },
    };
  }
  if (!session.upload_id || !session.part_size || !session.part_count) {
    throw new Error('Multipart 会话缺少必要字段');
  }
  return {
    mode: 'multipart',
    sessionId: session.session_id,
    partSize: session.part_size,
  };
}

/**
 * 清洗仅用于展示和 Content-Disposition 的原始文件名。
 *
 * @param filename 客户端提交的文件名。
 * @returns 不包含路径分隔符和控制字符的文件名。
 */
function sanitizeUploadFilename(filename: string): string {
  const normalized = filename
    .trim()
    .replace(illegalFilenameChars, '_')
    .replace(controlChars, '_');
  return normalized.slice(0, 255) || 'file';
}

/**
 * 构造服务端控制的不可猜测对象路径。
 *
 * @param input 文件标识、扩展名和日期分区时间。
 * @returns 不依赖用户文件名的对象路径。
 */
function buildObjectKey(input: {
  /** 通用文件稳定标识。 */
  fileId: string;
  /** 已规范化的文件扩展名。 */
  extension: SupportedFileExtension;
  /** 用于生成日期分区的当前时间。 */
  now: Date;
}): string {
  const year = String(input.now.getUTCFullYear());
  const month = String(input.now.getUTCMonth() + 1).padStart(2, '0');
  return `files/${year}/${month}/${input.fileId}/${randomUUID()}.${input.extension}`;
}

/**
 * 根据文件大小计算符合 S3 限制的分片方案。
 *
 * @param fileSize 文件总字节数。
 * @param preferredPartSize 首选分片字节数。
 * @returns 需要持久化并返回前端的分片大小和数量。
 */
function calculateMultipartPlan(
  fileSize: number,
  preferredPartSize: number,
): MultipartPlan {
  const minimumForCount = Math.ceil(fileSize / MAX_MULTIPART_PART_COUNT);
  const required = Math.max(
    MIN_MULTIPART_PART_SIZE,
    preferredPartSize,
    minimumForCount,
  );
  const partSize =
    Math.ceil(required / MULTIPART_PART_SIZE_STEP) * MULTIPART_PART_SIZE_STEP;
  return {
    partSize,
    partCount: Math.ceil(fileSize / partSize),
  };
}
