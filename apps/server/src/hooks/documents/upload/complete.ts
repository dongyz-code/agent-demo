import { and, eq, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { createDocumentVersionFromFile } from '../document/version.js';
import { createDocumentPreviewTask } from '../preview/task.js';
import { applyDocumentDatasetAssignment } from '../rag/assignment.js';
import {
  completeMultipartUpload,
  headStoredObject,
  listMultipartParts,
  openStoredObject,
} from '../storage/objects.js';
import { getUploadPolicy } from './policies.js';
import {
  assertTransferableUploadSession,
  getOwnedUploadSession,
  getUploadSourceFile,
  parseUploadDatasetIds,
} from './session.js';
import {
  calculateSha256Stream,
  detectTrustedContentType,
} from './validators.js';

import type { Upload, UploadedPartInfo } from '@repo/types';

/** 文件签名检测读取的最大前缀，足以覆盖常见格式识别。 */
const MAGIC_PREFIX_BYTES = 8192;

/**
 * 完成对象上传、创建文档版本并触发预览与版本内容任务。
 *
 * @param input 上传会话标识与可选 Multipart 完成清单。
 * @param userId 当前操作用户，用于会话所有权、文档范围和审计。
 * @returns 新建或复用的文档版本结果。
 */
export async function completeDocumentUpload(
  input: Upload['complete']['body'],
  userId: string,
): Promise<Upload['complete']['resp']> {
  const session = await getOwnedUploadSession(input.sessionId, userId);
  const file = await finishUpload(session, input.parts, userId);
  const binding = await createDocumentVersionFromFile(
    {
      fileId: file.file_id,
      documentId: session.document_id ?? undefined,
      name: session.document_name ?? file.filename,
      ragEnabled: true,
    },
    userId,
  );
  if (getUploadPolicy(session.policy_key).previewEnabled) {
    await createDocumentPreviewTask(
      {
        documentId: binding.document.documentId,
        documentVersionId: binding.documentVersionId,
        triggerSource: 'upload',
      },
      userId,
    );
  }
  const datasetIds = parseUploadDatasetIds(session.dataset_ids);
  if (session.enter_rag && datasetIds.length) {
    await applyDocumentDatasetAssignment({
      documentId: binding.document.documentId,
      documentVersionId: binding.documentVersionId,
      datasetIds,
      mode: 'add',
      userId,
      processingConfigVersion:
        session.processing_config_version ?? undefined,
      triggerSource: 'upload',
    });
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
  submittedParts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[] | undefined,
  userId: string,
) {
  if (session.status === 'completed') {
    return await getUploadSourceFile(session.file_id);
  }
  assertTransferableUploadSession(session);

  const [claimed] = await db
    .update(schemas.file_upload_sessions)
    .set({
      status: 'completing',
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.file_upload_sessions.session_id, session.session_id),
        inArray(schemas.file_upload_sessions.status, [
          'initialized',
          'uploading',
        ]),
      ),
    )
    .returning();
  if (!claimed) {
    throw new ROOT_ERROR('数据异常');
  }

  const file = await getUploadSourceFile(session.file_id);
  try {
    if (session.mode === 'multipart') {
      if (!session.upload_id || !session.part_count || !submittedParts) {
        throw new ROOT_ERROR('非法参数');
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

    const verified = await validateStoredFile(file, session, userId);
    await db
      .update(schemas.file_upload_sessions)
      .set({
        status: 'completed',
        uploaded_size: session.size,
        completed_timestamp: new Date(),
        error_code: null,
        error_message: null,
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(
        eq(schemas.file_upload_sessions.session_id, session.session_id),
      );
    return verified;
  } catch (error) {
    await db
      .update(schemas.file_upload_sessions)
      .set({
        status: 'failed',
        error_code: 'UPLOAD_FILE_REJECTED',
        error_message: error instanceof Error ? error.message : '上传完成失败',
        last_update_user_id: userId,
        last_update_timestamp: new Date(),
      })
      .where(
        eq(schemas.file_upload_sessions.session_id, session.session_id),
      );
    throw error;
  }
}

/** 验证上传完成后的对象并写入可信文件信息。 */
async function validateStoredFile(
  file: typeof schemas.files.$inferSelect,
  session: typeof schemas.file_upload_sessions.$inferSelect,
  userId: string,
) {
  const now = new Date();
  await db
    .update(schemas.files)
    .set({
      status: 'verifying',
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .where(eq(schemas.files.file_id, file.file_id));

  try {
    const head = await headStoredObject({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    if (head.ContentLength !== file.size) {
      throw new ROOT_ERROR('非法参数');
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
      throw new ROOT_ERROR('非法参数');
    }

    const sha256 = await calculateObjectSha256({
      bucket: file.bucket,
      objectKey: file.object_key,
    });
    const [updated] = await db
      .update(schemas.files)
      .set({
        content_type: trustedContentType,
        sha256,
        etag: head.ETag ?? file.etag,
        status: 'verified',
        verified_timestamp: now,
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

/** 流式计算对象 SHA-256，避免大文件整体进入内存。 */
async function calculateObjectSha256(body: {
  bucket: string;
  objectKey: string;
}) {
  return await calculateSha256Stream(await openStoredObject(body));
}

/** 校验客户端完成清单与对象存储 ListParts 结果一致。 */
function validateCompletionParts(
  actualParts: UploadedPartInfo[],
  submittedParts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[],
  partCount: number,
): void {
  if (actualParts.length !== partCount || submittedParts.length !== partCount) {
    throw new ROOT_ERROR('非法参数');
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

/** 规范化 S3 响应中可能带双引号的 ETag。 */
function normalizeEtag(value: string): string {
  return value.replace(/^"|"$/g, '');
}
