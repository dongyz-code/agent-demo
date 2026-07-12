import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { getUploadRuntimeConfig } from '@/configs/index.js';
import { countRows, db, schema } from '@/database/index.js';
import { createUploadError } from './errors.js';
import { toStoredFileInfo } from './file-service.js';
import {
  buildObjectKey,
  calculateMultipartPlan,
  createFileFingerprint,
  normalizeExtension,
  sanitizeUploadFilename,
} from './object-key.js';
import { getUploadPolicy } from './policies.js';
import { canCancelUploadSession, canTransferUploadSession } from './state.js';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listMultipartParts,
} from './storage/commands.js';
import { presignPutObject, presignUploadPart } from './storage/presign.js';
import { validateStoredFile } from './validation-service.js';

import type {
  StoredFileInfo,
  UploadPolicyKey,
  UploadSessionInfo,
  UploadSessionStatus,
  UploadedPartInfo,
} from '@repo/types';
import type { UploadActor } from './types.js';

/** 为一批合法分片编号签发上传 URL。 */
export async function signUploadParts(
  sessionId: string,
  partNumbers: number[],
  actor: UploadActor,
) {
  const session = await getOwnedSession(sessionId, actor);
  const config = getUploadRuntimeConfig();
  assertActiveSession(session);
  if (session.mode !== 'multipart' || !session.upload_id || !session.part_count) {
    throw createUploadError('UPLOAD_PART_INVALID', '当前会话不是 Multipart');
  }
  const uniqueParts = [...new Set(partNumbers)];
  if (
    !uniqueParts.length ||
    uniqueParts.length > config.maxSignedParts ||
    uniqueParts.some(
      (partNumber) =>
        !Number.isInteger(partNumber) ||
        partNumber < 1 ||
        partNumber > session.part_count!,
    )
  ) {
    throw createUploadError('UPLOAD_PART_INVALID', '分片编号范围不合法');
  }
  const file = await getInternalFile(session.file_id);
  const parts = await Promise.all(
    uniqueParts.map(async (partNumber) => {
      const signed = await presignUploadPart({
        bucket: file.bucket,
        objectKey: file.object_key,
        uploadId: session.upload_id!,
        partNumber,
      });
      return { partNumber, uploadUrl: signed.url, expiresAt: signed.expiresAt };
    }),
  );
  return { parts };
}

/** 读取并同步 Multipart 已上传分片。 */
export async function getUploadedParts(
  sessionId: string,
  actor: UploadActor,
) {
  const session = await getOwnedSession(sessionId, actor);
  assertActiveSession(session);
  if (session.mode !== 'multipart' || !session.upload_id || !session.part_count) {
    return { parts: [], uploadedSize: 0, missingPartNumbers: [] };
  }
  const file = await getInternalFile(session.file_id);
  const parts = await listMultipartParts({
    bucket: file.bucket,
    objectKey: file.object_key,
    uploadId: session.upload_id,
  });
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const part of parts) {
      await tx
        .insert(schema.file_upload_parts)
        .values({
          part_id: randomUUID(),
          session_id: session.session_id,
          part_number: part.partNumber,
          etag: part.etag,
          size: part.size,
          completed_timestamp: now,
        })
        .onConflictDoUpdate({
          target: [
            schema.file_upload_parts.session_id,
            schema.file_upload_parts.part_number,
          ],
          set: {
            etag: part.etag,
            size: part.size,
            completed_timestamp: now,
          },
        });
    }
    await tx
      .update(schema.file_upload_sessions)
      .set({
        status: session.status === 'initialized' ? 'uploading' : session.status,
        uploaded_size: parts.reduce((sum, part) => sum + part.size, 0),
        last_update_user_id: actor.userId,
        last_update_timestamp: now,
      })
      .where(eq(schema.file_upload_sessions.session_id, session.session_id));
  });
  const uploaded = new Set(parts.map((part) => part.partNumber));
  return {
    parts,
    uploadedSize: parts.reduce((sum, part) => sum + part.size, 0),
    missingPartNumbers: Array.from(
      { length: session.part_count },
      (_, index) => index + 1,
    ).filter((partNumber) => !uploaded.has(partNumber)),
  };
}

/** 幂等完成上传、验证对象并返回通用文件。 */
export async function finishUpload(
  sessionId: string,
  submittedParts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[] | undefined,
  actor: UploadActor,
): Promise<StoredFileInfo> {
  const session = await getOwnedSession(sessionId, actor);
  if (session.status === 'completed') {
    return toStoredFileInfo(await getInternalFile(session.file_id));
  }
  assertActiveSession(session);

  const [claimed] = await db
    .update(schema.file_upload_sessions)
    .set({
      status: 'completing',
      last_update_user_id: actor.userId,
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
    throw createUploadError(
      'UPLOAD_SESSION_STATE_CONFLICT',
      '上传正在由其他请求完成',
      'conflict',
    );
  }

  const file = await getInternalFile(session.file_id);
  try {
    if (session.mode === 'multipart') {
      if (!session.upload_id || !session.part_count || !submittedParts) {
        throw createUploadError('UPLOAD_PART_INVALID', '缺少 Multipart 分片信息');
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

    const verified = await validateStoredFile(file.file_id, actor);
    await db
      .update(schema.file_upload_sessions)
      .set({
        status: 'completed',
        uploaded_size: session.size,
        completed_timestamp: new Date(),
        error_code: null,
        error_message: null,
        last_update_user_id: actor.userId,
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
        last_update_user_id: actor.userId,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.file_upload_sessions.session_id, sessionId));
    throw error;
  }
}

/** 取消尚未完成的上传会话。 */
export async function cancelUpload(sessionId: string, actor: UploadActor) {
  const session = await getOwnedSession(sessionId, actor);
  if (['canceled', 'expired'].includes(session.status)) {
    return;
  }
  if (!canCancelUploadSession(session.status)) {
    throw createUploadError(
      'UPLOAD_SESSION_STATE_CONFLICT',
      '已完成上传不能取消',
      'conflict',
    );
  }
  const file = await getInternalFile(session.file_id);
  if (session.mode === 'multipart' && session.upload_id) {
    await abortMultipartUpload({
      bucket: file.bucket,
      objectKey: file.object_key,
      uploadId: session.upload_id,
    });
  }
  await db
    .update(schema.file_upload_sessions)
    .set({
      status: 'canceled',
      last_update_user_id: actor.userId,
      last_update_timestamp: new Date(),
    })
    .where(eq(schema.file_upload_sessions.session_id, sessionId));
}

/** 查询调用者拥有的上传会话。 */
async function getOwnedSession(sessionId: string, actor: UploadActor) {
  const [session] = await db
    .select()
    .from(schema.file_upload_sessions)
    .where(
      and(
        eq(schema.file_upload_sessions.session_id, sessionId),
        eq(schema.file_upload_sessions.tenant_id, actor.tenantId),
        eq(schema.file_upload_sessions.create_user_id, actor.userId),
      ),
    )
    .limit(1);
  if (!session) {
    throw createUploadError(
      'UPLOAD_SESSION_NOT_FOUND',
      '上传会话不存在',
      'not-found',
    );
  }
  return session;
}

/** 查询上传模块内部文件行。 */
async function getInternalFile(fileId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.file_id, fileId))
    .limit(1);
  if (!file) {
    throw createUploadError(
      'UPLOAD_SESSION_NOT_FOUND',
      '文件记录不存在',
      'not-found',
    );
  }
  return file;
}

/** 检查上传会话是否仍可进行网络操作。 */
function assertActiveSession(
  session: typeof schema.file_upload_sessions.$inferSelect,
) {
  if (session.expire_timestamp.getTime() <= Date.now()) {
    throw createUploadError('UPLOAD_SESSION_EXPIRED', '上传会话已过期');
  }
  if (!canTransferUploadSession(session.status)) {
    throw createUploadError(
      'UPLOAD_SESSION_STATE_CONFLICT',
      `当前状态不允许上传：${session.status}`,
      'conflict',
    );
  }
}

/** 校验客户端完成清单与 MinIO ListParts 一致。 */
function validateCompletionParts(
  actualParts: UploadedPartInfo[],
  submittedParts: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[],
  partCount: number,
) {
  if (actualParts.length !== partCount || submittedParts.length !== partCount) {
    throw createUploadError('UPLOAD_PART_INVALID', '分片数量不完整');
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
      throw createUploadError('UPLOAD_PART_INVALID', `分片 ${partNumber} 不匹配`);
    }
  }
}

/** ETag 比较时忽略 S3 响应可能携带的双引号。 */
function normalizeEtag(value: string) {
  return value.replace(/^"|"$/g, '');
}

/** 将数据库会话转换为公共响应。 */
function toUploadSessionInfo(
  session: typeof schema.file_upload_sessions.$inferSelect,
): UploadSessionInfo {
  return {
    sessionId: session.session_id,
    fileId: session.file_id,
    policyKey: session.policy_key,
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

