import { and, eq, inArray } from 'drizzle-orm';

import {
  getFileProcessingRuntimeConfig,
  ROOT_ERROR,
} from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import {
  assertActiveSession,
  calculateSha256Stream,
  completeMultipartUpload,
  createFileProcessingTask,
  detectTrustedContentType,
  getFileRow,
  getOwnedSession,
  getUploadPolicy,
  getUploadSessionInfo,
  headStoredObject,
  listMultipartParts,
  openStoredObject,
  toStoredFileInfo,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

import type { StoredFileInfo, Upload, UploadedPartInfo } from '@repo/types';

const { api } = routerHandler({
  url: '/documents/upload-complete',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const file = await finishUpload(
      body.sessionId,
      body.parts,
      __token.user_id,
    );
    const session = await getUploadSessionInfo(body.sessionId, __token.user_id);
    if (
      getFileProcessingRuntimeConfig().enabled &&
      session.enterRag &&
      session.datasetId
    ) {
      await createFileProcessingTask(
        {
          fileId: file.fileId,
          datasetId: session.datasetId,
          processingConfigVersion:
            session.processingConfigVersion ?? undefined,
          triggerSource: 'upload',
        },
        __token.user_id,
      );
    }
    return file;
  },
});

/** 幂等完成上传、验证对象并返回通用文件。 */
async function finishUpload(
  sessionId: string,
  submittedParts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[] | undefined,
  userId: string,
): Promise<StoredFileInfo> {
  const session = await getOwnedSession(sessionId, userId);
  if (session.status === 'completed') {
    return toStoredFileInfo(await getFileRow(session.file_id));
  }
  assertActiveSession(session);

  const [claimed] = await db
    .update(schema.file_upload_sessions)
    .set({
      status: 'completing',
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schema.file_upload_sessions.session_id, sessionId),
        inArray(schema.file_upload_sessions.status, ['initialized', 'uploading']),
      ),
    )
    .returning();
  if (!claimed) {
    throw new ROOT_ERROR(
      '数据异常',
      'UPLOAD_SESSION_STATE_CONFLICT: 上传正在由其他请求完成',
    );
  }

  const file = await getFileRow(session.file_id);
  try {
    if (session.mode === 'multipart') {
      if (!session.upload_id || !session.part_count || !submittedParts) {
        throw new ROOT_ERROR(
          '非法参数',
          'UPLOAD_PART_INVALID: 缺少 Multipart 分片信息',
        );
      }
      const actualParts = await listMultipartParts({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id,
      });
      validateCompletionParts(actualParts, submittedParts, session.part_count);
      await completeMultipartUpload({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id,
        parts: actualParts,
      });
    }

    const verified = await validateStoredFile(file.file_id, userId);
    await db
      .update(schema.file_upload_sessions)
      .set({
        status: 'completed',
        uploaded_size: session.size,
        completed_timestamp: new Date(),
        error_code: null,
        error_message: null,
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.file_upload_sessions.session_id, sessionId));
    return toStoredFileInfo(verified);
  } catch (error) {
    await db
      .update(schema.file_upload_sessions)
      .set({
        status: 'failed',
        error_code: 'UPLOAD_FILE_REJECTED',
        error_message: error instanceof Error ? error.message : '上传完成失败',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.file_upload_sessions.session_id, sessionId));
    throw error;
  }
}

/** 文件签名检测读取的最大前缀，足以覆盖常见格式识别。 */
const MAGIC_PREFIX_BYTES = 8192;

/** 验证上传完成后的对象并写入可信文件信息。 */
async function validateStoredFile(fileId: string, userId: string) {
  const file = await getFileRow(fileId);

  const [session] = await db
    .select()
    .from(schema.file_upload_sessions)
    .where(eq(schema.file_upload_sessions.file_id, fileId))
    .limit(1);
  if (!session) {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'UPLOAD_SESSION_NOT_FOUND: 上传会话不存在',
    );
  }

  const now = new Date();
  await db
    .update(schema.files)
    .set({
      status: 'verifying',
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .where(eq(schema.files.file_id, fileId));

  try {
    const head = await headStoredObject({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    if (head.ContentLength !== file.size) {
      throw new ROOT_ERROR(
        '非法参数',
        'UPLOAD_OBJECT_MISMATCH: 对象大小与初始化声明不一致',
      );
    }

    const prefix = await readObjectPrefix({
      bucket: file.bucket,
      objectKey: file.object_key,
      limit: MAGIC_PREFIX_BYTES,
    });
    const trustedContentType = await detectTrustedContentType({
      prefix,
      declaredContentType: file.declared_content_type,
    });
    const policy = getUploadPolicy(session.policy_key);
    if (
      !trustedContentType ||
      !policy.allowedContentTypes.includes(trustedContentType)
    ) {
      throw new ROOT_ERROR(
        '非法参数',
        'UPLOAD_FILE_TYPE_NOT_ALLOWED: 实际文件类型不在上传策略允许范围内',
      );
    }

    const sha256 = await calculateObjectSha256({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    const [updated] = await db
      .update(schema.files)
      .set({
        content_type: trustedContentType,
        sha256,
        etag: head.ETag ?? file.etag,
        status: 'verified',
        verified_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      })
      .where(eq(schema.files.file_id, fileId))
      .returning();
    if (!updated) {
      throw new Error('文件验证结果写入失败');
    }
    return updated;
  } catch (error) {
    await db
      .update(schema.files)
      .set({
        status: 'rejected',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.files.file_id, fileId));
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

/** 流式计算对象 SHA-256，避免大文件整体进入内存。 */
async function calculateObjectSha256(body: {
  bucket: string;
  objectKey: string;
}) {
  return await calculateSha256Stream(await openStoredObject(body));
}

/** 校验客户端完成清单与 MinIO ListParts 一致。 */
function validateCompletionParts(
  actualParts: UploadedPartInfo[],
  submittedParts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[],
  partCount: number,
) {
  if (actualParts.length !== partCount || submittedParts.length !== partCount) {
    throw new ROOT_ERROR('非法参数', 'UPLOAD_PART_INVALID: 分片数量不完整');
  }
  const submitted = new Map(
    submittedParts.map((part) => [part.partNumber, normalizeEtag(part.etag)]),
  );
  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    const actual = actualParts[partNumber - 1];
    if (
      actual?.partNumber !== partNumber ||
      normalizeEtag(actual.etag) !== submitted.get(partNumber)
    ) {
      throw new ROOT_ERROR(
        '非法参数',
        `UPLOAD_PART_INVALID: 分片 ${partNumber} 不匹配`,
      );
    }
  }
}

/** ETag 比较时忽略 S3 响应可能携带的双引号。 */
function normalizeEtag(value: string) {
  return value.replace(/^"|"$/g, '');
}

export default api;
