import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { buildWhere, db, schemas } from '@/database/index.js';

import type { UploadSessionStatus } from '@repo/types';

/** 允许继续签名、恢复或完成对象上传的会话状态。 */
const transferableStatuses = new Set<UploadSessionStatus>([
  'initialized',
  'uploading',
]);

/**
 * 查询调用者拥有的上传会话。
 *
 * @param sessionId 上传会话标识。
 * @param userId 当前操作用户，用于限制会话所有权。
 * @returns 上传会话数据库行。
 */
export async function getOwnedUploadSession(sessionId: string, userId: string) {
  const where = buildWhere((filter) => {
    filter.push(
      eq(schemas.file_upload_sessions.session_id, sessionId),
      eq(schemas.file_upload_sessions.create_user_id, userId),
    );
  });
  const [session] = await db
    .select()
    .from(schemas.file_upload_sessions)
    .where(where)
    .limit(1);
  if (!session) {
    throw new ROOT_ERROR('相关文件不存在');
  }
  return session;
}

/**
 * 校验会话当前允许继续执行对象传输操作。
 *
 * @param session 上传会话数据库行。
 * @returns 校验通过时无返回值。
 */
export function assertTransferableUploadSession(
  session: typeof schemas.file_upload_sessions.$inferSelect,
): void {
  if (session.expire_timestamp.getTime() <= Date.now()) {
    throw new ROOT_ERROR('文件上传: 上传会话已过期，请重新选择文件');
  }
  if (!transferableStatuses.has(session.status)) {
    if (session.status === 'completing') {
      throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
    }
    throw new ROOT_ERROR('文件上传: 上传会话已结束，请重新选择文件');
  }
}
