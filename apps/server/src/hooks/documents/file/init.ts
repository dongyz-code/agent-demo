import { randomUUID } from 'node:crypto';
import { eq, ne } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';
import { getFileExtension } from '@repo/shared';
import { documentsConfig } from '../config.js';
import {
  abortMultipartUpload,
  buildObjectKey,
  calculateMultipartPlan,
  createMultipartUpload,
  presignPutObject,
  sanitizeUploadFilename,
} from './objects.js';
import { getUploadPolicy } from './policies.js';
import { getStoredFile } from './source.js';

import type { Upload } from '@repo/types';

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
  const policy = getUploadPolicy(input.policyKey);
  const filename = sanitizeUploadFilename(input.filename);
  const extension = getFileExtension(filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new ROOT_ERROR('文件上传: 文件不能为空');
  }
  if (input.size > policy.maxFileSizeBytes) {
    throw new ROOT_ERROR('文件上传: 文件大小超过限制');
  }
  if (
    !extension ||
    !policy.allowedContentTypes.includes(input.contentType) ||
    !policy.allowedExtensions.includes(extension)
  ) {
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

  const s3 = ROOT.storage.s3;
  const now = new Date();
  const fileId = randomUUID();
  const sessionId = randomUUID();
  const objectKey = buildObjectKey({ fileId, extension, now });
  const mode =
    input.size >= policy.multipartThresholdBytes ? 'multipart' : 'single';
  const multipart =
    mode === 'multipart'
      ? calculateMultipartPlan(input.size, policy.partSizeBytes)
      : undefined;
  let uploadId: string | undefined;
  if (mode === 'multipart') {
    uploadId = await createMultipartUpload({
      bucket: s3.bucket,
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
        bucket: s3.bucket,
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
          policy_key: input.policyKey,
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
      await abortMultipartUpload({
        bucket: s3.bucket,
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
    const signed = await presignPutObject({
      bucket: file.bucket,
      objectKey: file.object_key,
      contentType: file.declared_content_type,
    });
    return {
      mode: 'single',
      sessionId: session.session_id,
      uploadUrl: signed.url,
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
