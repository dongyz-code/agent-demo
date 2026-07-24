import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { documentsConfig } from '../config.js';
import {
  abortMultipartUpload,
  createMultipartUpload,
} from '../storage/objects.js';
import { presignPutObject } from '../storage/presign.js';
import {
  buildObjectKey,
  calculateMultipartPlan,
  createFileFingerprint,
  normalizeExtension,
  sanitizeUploadFilename,
} from './object-key.js';
import { getUploadPolicy } from './policies.js';
import { getUploadSourceFile, parseUploadDatasetIds } from './session.js';

import type { Upload, UploadSessionInfo } from '@repo/types';

type UploadInitBody = Upload['init']['body'];

/** 已完成文档意图规范化的上传初始化输入。 */
type NormalizedUploadInitBody = UploadInitBody & {
  /** 本次是否建立知识库关系并触发版本内容任务。 */
  enterRag: boolean;
  /** 已去重并验证的目标知识库标识。 */
  datasetIds: string[];
};

/**
 * 初始化文档的普通或 Multipart 上传流程。
 *
 * @param input 客户端上传声明、文档意图和幂等信息。
 * @param userId 当前操作用户，用于文档范围与上传会话所有权。
 * @returns 普通上传签名或 Multipart 会话描述。
 */
export async function initializeDocumentUpload(
  input: UploadInitBody,
  userId: string,
): Promise<Upload['init']['resp']> {
  const targetDocument = input.documentId
    ? await getUploadTargetDocument(input.documentId, userId)
    : undefined;
  const defaultEnterRag =
    input.policyKey === 'rag-document' && documentsConfig.fileProcessing.enabled
      ? (targetDocument?.ragEnabled ?? documentsConfig.fileProcessing.defaultEnterRag)
      : false;
  const enterRag = input.enterRag ?? defaultEnterRag;
  const datasetIds = [
    ...new Set(
      enterRag
        ? (input.datasetIds ?? targetDocument?.datasetIds ?? [])
        : [],
    ),
  ];
  await assertActiveDatasets(datasetIds);
  return await initUpload(
    {
      ...input,
      enterRag,
      datasetIds: enterRag ? datasetIds : [],
    },
    userId,
  );
}

/** 查询上传新版本所需的最小文档默认配置与知识库集合。 */
async function getUploadTargetDocument(documentId: string, userId: string) {
  const [document] = await db
    .select({
      ragEnabled: schemas.documents.rag_enabled,
    })
    .from(schemas.documents)
    .where(
      and(
        eq(schemas.documents.document_id, documentId),
        eq(schemas.documents.create_user_id, userId),
        ne(schemas.documents.status, 'deleted'),
      ),
    )
    .limit(1);
  if (!document) {
    throw new ROOT_ERROR('相关文件不存在');
  }
  const relations = await db
    .select({ datasetId: schemas.rag_dataset_documents.dataset_id })
    .from(schemas.rag_dataset_documents)
    .where(eq(schemas.rag_dataset_documents.document_id, documentId));
  return {
    ragEnabled: document.ragEnabled,
    datasetIds: relations.map((relation) => relation.datasetId),
  };
}

/** 校验上传选择的所有知识库存在且处于启用状态。 */
async function assertActiveDatasets(datasetIds: string[]): Promise<void> {
  if (!datasetIds.length) return;
  const rows = await db
    .select({
      id: schemas.rag_datasets.dataset_id,
      status: schemas.rag_datasets.status,
    })
    .from(schemas.rag_datasets)
    .where(inArray(schemas.rag_datasets.dataset_id, datasetIds));
  const datasets = new Map(rows.map((row) => [row.id, row.status]));
  for (const datasetId of datasetIds) {
    const status = datasets.get(datasetId);
    if (!status) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    if (status !== 'active') {
      throw new ROOT_ERROR('数据异常');
    }
  }
}

/** 初始化已完成文档意图规范化的上传会话。 */
async function initUpload(input: NormalizedUploadInitBody, userId: string) {
  const policy = getUploadPolicy(input.policyKey);
  const filename = sanitizeUploadFilename(input.filename);
  const extension = normalizeExtension(filename);
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new ROOT_ERROR('非法参数');
  }
  if (input.size > policy.maxFileSizeBytes) {
    throw new ROOT_ERROR('非法参数');
  }
  if (
    !policy.allowedContentTypes.includes(input.contentType) ||
    !policy.allowedExtensions.includes(extension)
  ) {
    throw new ROOT_ERROR('非法参数');
  }

  const fingerprint = createFileFingerprint({
    filename,
    size: input.size,
    contentType: input.contentType,
    clientFingerprint: input.fingerprint,
  });
  const documentScope = input.documentId ?? 'new';
  const [existing] = await db
    .select()
    .from(schemas.file_upload_sessions)
    .where(
      and(
        eq(schemas.file_upload_sessions.create_user_id, userId),
        eq(schemas.file_upload_sessions.policy_key, input.policyKey),
        eq(schemas.file_upload_sessions.document_scope, documentScope),
        eq(schemas.file_upload_sessions.fingerprint, fingerprint),
        eq(schemas.file_upload_sessions.idempotency_key, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing && !['failed', 'canceled', 'expired'].includes(existing.status)) {
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
      filename,
    });
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schemas.files).values({
        file_id: fileId,
        filename,
        extension,
        declared_content_type: input.contentType,
        content_type: null,
        size: input.size,
        sha256: null,
        bucket: s3.bucket,
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
      await tx.insert(schemas.file_upload_sessions).values({
        session_id: sessionId,
        file_id: fileId,
        policy_key: input.policyKey,
        enter_rag: input.enterRag,
        document_intent: input.documentId
          ? 'create-version'
          : 'create-document',
        document_id: input.documentId ?? null,
        document_name: input.documentName?.trim() || null,
        document_scope: documentScope,
        dataset_ids: JSON.stringify(input.datasetIds),
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
          now.getTime() + documentsConfig.upload.sessionExpiresSeconds * 1000,
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
        bucket: s3.bucket,
        objectKey,
        uploadId,
      }).catch(() => undefined);
    }
    throw error;
  }

  const [created] = await db
    .select()
    .from(schemas.file_upload_sessions)
    .where(eq(schemas.file_upload_sessions.session_id, sessionId))
    .limit(1);
  if (!created) throw new Error('上传会话创建后无法读取');
  return await buildInitResponse(created);
}

/** 根据现有上传会话重建初始化响应与短期签名。 */
async function buildInitResponse(
  session: typeof schemas.file_upload_sessions.$inferSelect,
): Promise<Upload['init']['resp']> {
  const file = await getUploadSourceFile(session.file_id);
  if (session.mode === 'single') {
    const signed = await presignPutObject({
      bucket: file.bucket,
      objectKey: file.object_key,
      contentType: session.declared_content_type,
    });
    return {
      mode: 'single',
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
    mode: 'multipart',
    session: toUploadSessionInfo(session),
    uploadId: session.upload_id,
    partSize: session.part_size,
    partCount: session.part_count,
  };
}

/** 将上传会话数据库行转换为初始化响应需要的安全摘要。 */
function toUploadSessionInfo(
  session: typeof schemas.file_upload_sessions.$inferSelect,
): UploadSessionInfo {
  return {
    sessionId: session.session_id,
    fileId: session.file_id,
    policyKey: session.policy_key,
    enterRag: session.enter_rag,
    documentIntent: session.document_intent,
    documentId: session.document_id,
    documentName: session.document_name,
    datasetIds: parseUploadDatasetIds(session.dataset_ids),
    processingConfigVersion: session.processing_config_version,
    mode: session.mode,
    status: session.status,
    filename: session.filename,
    size: session.size,
    partSize: session.part_size,
    partCount: session.part_count,
    uploadedSize: session.uploaded_size,
    expiresAt: session.expire_timestamp,
    errorCode: session.error_code,
    errorMessage: session.error_message,
  };
}
