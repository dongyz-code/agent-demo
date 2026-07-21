import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import {
  abortMultipartUpload,
  buildObjectKey,
  calculateMultipartPlan,
  createMultipartUpload,
  createFileFingerprint,
  getFileRow,
  getRagDataset,
  getUploadPolicy,
  normalizeExtension,
  presignPutObject,
  sanitizeUploadFilename,
  toUploadSessionInfo,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

import type { Upload } from '@repo/types';

type UploadInitBody = Upload['init']['body'];

const { api } = routerHandler({
  url: '/documents/upload-init',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const defaultEnterRag =
      body.policyKey === 'rag-document' &&
      ROOT.fileProcessing.enabled
        ? ROOT.fileProcessing.defaultEnterRag
        : false;
    const enterRag = body.enterRag ?? defaultEnterRag;
    if (enterRag && !body.datasetId) {
      throw new ROOT_ERROR(
        '非法参数',
        'FILE_PROCESSING_DATASET_REQUIRED: 选择进入 RAG 时必须指定目标知识库',
      );
    }
    if (enterRag && body.datasetId) {
      const dataset = await getRagDataset(body.datasetId);
      if (dataset.status !== 'active') {
        throw new ROOT_ERROR(
          '数据异常',
          'FILE_PROCESSING_DATASET_DISABLED: 目标知识库已停用',
        );
      }
    }
    return await initUpload(
      { ...body, enterRag, datasetId: enterRag ? body.datasetId : undefined },
      __token.user_id,
    );
  },
});

/** 初始化普通或 Multipart 上传。 */
async function initUpload(input: UploadInitBody, userId: string) {
  const policy = getUploadPolicy(input.policyKey);
  const filename = sanitizeUploadFilename(input.filename);
  const extension = normalizeExtension(filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new ROOT_ERROR('非法参数', 'UPLOAD_OBJECT_MISMATCH: 文件大小必须为正整数');
  }
  if (input.size > policy.maxFileSizeBytes) {
    throw new ROOT_ERROR('非法参数', 'UPLOAD_FILE_TOO_LARGE: 文件超过策略大小上限');
  }
  if (
    !policy.allowedContentTypes.includes(input.contentType) ||
    !policy.allowedExtensions.includes(extension)
  ) {
    throw new ROOT_ERROR(
      '非法参数',
      'UPLOAD_FILE_TYPE_NOT_ALLOWED: 声明文件类型不在策略允许范围内',
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

  const config = ROOT.upload;
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
  const file = await getFileRow(session.file_id);
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

export default api;
