import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { getUploadRuntimeConfig } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { createDomainError } from '../errors.js';
import {
  buildObjectKey,
  calculateMultipartPlan,
  createFileFingerprint,
  normalizeExtension,
  sanitizeUploadFilename,
} from './object-key.js';
import { getUploadPolicy } from './policies.js';
import {
  abortMultipartUpload,
  createMultipartUpload,
  presignPutObject,
} from '../storage/index.js';
import { getInternalFile, toUploadSessionInfo } from './shared.js';

import type { UploadPolicyKey } from '@repo/types';

/** 初始化普通或 Multipart 上传。 */
export async function initUpload(
  input: {
    /** 服务端上传策略键。 */
    policyKey: UploadPolicyKey;
    /** 原始文件名。 */
    filename: string;
    /** 浏览器声明 MIME。 */
    contentType: string;
    /** 文件字节数。 */
    size: number;
    /** 客户端文件指纹。 */
    fingerprint: string;
    /** 请求幂等键。 */
    idempotencyKey: string;
    /** 文件验证成功后是否自动进入 RAG 接入流程。 */
    enterRag?: boolean;
    /** 自动处理使用的目标知识库。 */
    datasetId?: string;
    /** 自动处理使用的配置组合版本。 */
    processingConfigVersion?: string;
  },
  userId: string,
) {
  const policy = getUploadPolicy(input.policyKey);
  const filename = sanitizeUploadFilename(input.filename);
  const extension = normalizeExtension(filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw createDomainError('UPLOAD_OBJECT_MISMATCH', '文件大小必须为正整数');
  }
  if (input.size > policy.maxFileSizeBytes) {
    throw createDomainError('UPLOAD_FILE_TOO_LARGE', '文件超过策略大小上限');
  }
  if (
    !policy.allowedContentTypes.includes(input.contentType) ||
    !policy.allowedExtensions.includes(extension)
  ) {
    throw createDomainError(
      'UPLOAD_FILE_TYPE_NOT_ALLOWED',
      '声明文件类型不在策略允许范围内',
    );
  }

  const fingerprint = createFileFingerprint({
    filename,
    size: input.size,
    contentType: input.contentType,
    clientFingerprint: input.fingerprint,
  });
  const [existing] = await db
    .select()
    .from(schema.file_upload_sessions)
    .where(
      and(
        eq(schema.file_upload_sessions.create_user_id, userId),
        eq(schema.file_upload_sessions.policy_key, input.policyKey),
        eq(schema.file_upload_sessions.fingerprint, fingerprint),
        eq(schema.file_upload_sessions.idempotency_key, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing && !['failed', 'canceled', 'expired'].includes(existing.status)) {
    return await buildInitResponse(existing);
  }

  const config = getUploadRuntimeConfig();
  const now = new Date();
  const fileId = randomUUID();
  const sessionId = randomUUID();
  const objectKey = buildObjectKey({
    fileId,
    extension,
    now,
  });
  const mode = input.size >= policy.multipartThresholdBytes ? 'multipart' : 'single';
  const multipart =
    mode === 'multipart'
      ? calculateMultipartPlan(input.size, policy.partSizeBytes)
      : undefined;
  let uploadId: string | undefined;
  if (mode === 'multipart') {
    uploadId = await createMultipartUpload({
      bucket: config.bucket,
      objectKey,
      contentType: input.contentType,
      filename,
    });
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.files).values({
        file_id: fileId,
        filename,
        extension,
        declared_content_type: input.contentType,
        content_type: null,
        size: input.size,
        sha256: null,
        bucket: config.bucket,
        object_key: objectKey,
        etag: null,
        status: 'pending',
        verified_timestamp: null,
        deleted_timestamp: null,
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      });
      await tx.insert(schema.file_upload_sessions).values({
        session_id: sessionId,
        file_id: fileId,
        policy_key: input.policyKey,
        enter_rag: input.enterRag ?? false,
        dataset_id: input.datasetId ?? null,
        processing_config_version: input.processingConfigVersion ?? null,
        fingerprint,
        idempotency_key: input.idempotencyKey,
        mode,
        upload_id: uploadId ?? null,
        filename,
        declared_content_type: input.contentType,
        size: input.size,
        part_size: multipart?.partSize ?? null,
        part_count: multipart?.partCount ?? null,
        uploaded_size: 0,
        status: 'initialized',
        expire_timestamp: new Date(
          now.getTime() + config.sessionExpiresSeconds * 1000,
        ),
        completed_timestamp: null,
        error_code: null,
        error_message: null,
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      });
    });
  } catch (error) {
    if (uploadId) {
      await abortMultipartUpload({
        bucket: config.bucket,
        objectKey,
        uploadId,
      }).catch(() => undefined);
    }
    throw error;
  }

  const [created] = await db
    .select()
    .from(schema.file_upload_sessions)
    .where(eq(schema.file_upload_sessions.session_id, sessionId))
    .limit(1);
  if (!created) {
    throw new Error('上传会话创建后无法读取');
  }
  return await buildInitResponse(created);
}

/** 复用或重签初始化结果。 */
async function buildInitResponse(
  session: typeof schema.file_upload_sessions.$inferSelect,
) {
  const file = await getInternalFile(session.file_id);
  if (session.mode === 'single') {
    const signed = await presignPutObject({
      bucket: file.bucket,
      objectKey: file.object_key,
      contentType: session.declared_content_type,
    });
    return {
      mode: 'single' as const,
      session: toUploadSessionInfo(session),
      uploadUrl: signed.url,
      headers: { 'Content-Type': session.declared_content_type },
      expiresAt: signed.expiresAt,
    };
  }
  if (!session.upload_id || !session.part_size || !session.part_count) {
    throw new Error('Multipart 会话缺少必要字段');
  }
  return {
    mode: 'multipart' as const,
    session: toUploadSessionInfo(session),
    uploadId: session.upload_id,
    partSize: session.part_size,
    partCount: session.part_count,
  };
}
