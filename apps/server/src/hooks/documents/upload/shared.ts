import { and, eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';

import type { UploadSessionInfo, UploadSessionStatus } from '@repo/types';

/** 允许继续签名、恢复或完成对象上传的会话状态。 */
const transferableStatuses = new Set<UploadSessionStatus>([
  'initialized',
  'uploading',
]);

/**
 * 判断会话是否允许继续对象传输。
 *
 * @param status 当前上传会话状态。
 * @returns 初始化或上传中返回 true。
 */
export function canTransferUploadSession(status: UploadSessionStatus): boolean {
  return transferableStatuses.has(status);
}

/**
 * 判断会话是否允许主动取消。
 *
 * @param status 当前上传会话状态。
 * @returns 非终态会话返回 true。
 */
export function canCancelUploadSession(status: UploadSessionStatus): boolean {
  return !['completed', 'canceled', 'expired'].includes(status);
}

/** 查询调用者拥有的上传会话，不存在则抛 not-found。 */
export async function getOwnedSession(sessionId: string, userId: string) {
  const [session] = await db
    .select()
    .from(schema.file_upload_sessions)
    .where(
      and(
        eq(schema.file_upload_sessions.session_id, sessionId),
        eq(schema.file_upload_sessions.create_user_id, userId),
      ),
    )
    .limit(1);
  if (!session) {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'UPLOAD_SESSION_NOT_FOUND: 上传会话不存在',
    );
  }
  return session;
}

/** 将数据库会话行转换为公共响应。 */
export function toUploadSessionInfo(
  session: typeof schema.file_upload_sessions.$inferSelect,
): UploadSessionInfo {
  return {
    sessionId: session.session_id,
    fileId: session.file_id,
    policyKey: session.policy_key,
    enterRag: session.enter_rag,
    datasetId: session.dataset_id,
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

/** 查询单个上传会话状态。 */
export async function getUploadSessionInfo(sessionId: string, userId: string) {
  return toUploadSessionInfo(await getOwnedSession(sessionId, userId));
}

/** 检查上传会话是否仍可进行网络操作。 */
export function assertActiveSession(
  session: typeof schema.file_upload_sessions.$inferSelect,
) {
  if (session.expire_timestamp.getTime() <= Date.now()) {
    throw new ROOT_ERROR('非法参数', 'UPLOAD_SESSION_EXPIRED: 上传会话已过期');
  }
  if (!canTransferUploadSession(session.status)) {
    throw new ROOT_ERROR(
      '数据异常',
      `UPLOAD_SESSION_STATE_CONFLICT: 当前状态不允许上传：${session.status}`,
    );
  }
}
