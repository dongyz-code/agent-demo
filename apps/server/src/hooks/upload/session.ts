import { and, eq, inArray } from 'drizzle-orm';

import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';

import type { DbTransaction } from '@/database/index.js';
import type { UploadSessionStatus } from '@repo/types';
import type { FileReader } from './types.js';

/** 上传流程读取的会话快照，写入时必须再次校验当前状态。 */
export type UploadSession = typeof schemas.file_upload_sessions.$inferSelect;

/**
 * 同时读取会话和文件并校验所有权，避免向其他用户泄露上传能力。
 *
 * @param sessionId 服务端生成的会话标识。
 * @param userId 当前操作用户，系统管理员可以管理全部会话。
 * @param executor 可选外层事务或默认数据库。
 * @returns 已授权的会话和内部文件记录。
 */
export async function requireUploadSession(
  sessionId: string,
  userId: string,
  executor: FileReader = db,
) {
  if (typeof sessionId !== 'string' || !sessionId || !userId) {
    throw new ROOT_ERROR('非法参数');
  }
  let owner;
  if (userId !== ROOT.SYS_ADMIN_USER_ID) {
    owner = eq(schemas.file_upload_sessions.create_user_id, userId);
  }
  const [row] = await executor
    .select({ session: schemas.file_upload_sessions, file: schemas.files })
    .from(schemas.file_upload_sessions)
    .innerJoin(
      schemas.files,
      eq(schemas.files.file_id, schemas.file_upload_sessions.file_id),
    )
    .where(and(eq(schemas.file_upload_sessions.session_id, sessionId), owner))
    .limit(1);
  if (!row) throw new ROOT_ERROR('相关文件不存在');
  return row;
}

/**
 * 使用数据库预期旧状态领取流程执行权，迟到请求不能覆盖完成或确认状态。
 *
 * @param session 当前用户已授权的会话快照。
 * @param expected 当前动作允许的旧状态。
 * @param status 成功领取后写入的新状态。
 * @param userId 本次状态变化的审计用户。
 * @param executor 可选事务，使文件与会话状态能原子提交。
 * @returns 更新后的会话，已被其他流程修改时返回空。
 */
export async function transitionUploadSession(
  session: UploadSession,
  expected: UploadSessionStatus[],
  status: UploadSessionStatus,
  userId: string,
  executor: Pick<typeof db, 'update'> = db,
): Promise<UploadSession | undefined> {
  const [updated] = await executor
    .update(schemas.file_upload_sessions)
    .set({
      status,
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.file_upload_sessions.session_id, session.session_id),
        inArray(schemas.file_upload_sessions.status, expected),
      ),
    )
    .returning();
  return updated;
}

/**
 * 判断当前会话是否仍允许上传或恢复，完成后的对象永远不再签发写地址。
 *
 * @param session 已授权会话的数据库快照。
 * @returns 校验通过时无返回值，否则抛出明确的终态或过期错误。
 */
export function assertTransferableUploadSession(session: UploadSession): void {
  if (session.expire_timestamp.getTime() <= Date.now()) {
    throw new ROOT_ERROR('文件上传: 上传会话已过期，请重新选择文件');
  }
  if (session.status === 'completing') {
    throw new ROOT_ERROR('文件上传: 上传会话正在确认，请稍后重试');
  }
  if (session.status !== 'initialized' && session.status !== 'uploading') {
    throw new ROOT_ERROR('文件上传: 上传会话已结束，请重新选择文件');
  }
}

/**
 * 在同一事务内发布文件可信状态和会话完成状态。
 *
 * @param transaction 当前完成事务。
 * @param session 已领取 completing 执行权的会话。
 * @param contentType 经过最终对象校验的可信 MIME。
 * @param userId 操作用户，用于审计。
 * @returns 已完成的内部文件记录。
 */
export async function publishVerifiedFile(
  transaction: DbTransaction,
  session: UploadSession,
  contentType: string,
  userId: string,
) {
  const completed = await transitionUploadSession(
    session,
    ['completing'],
    'completed',
    userId,
    transaction,
  );
  if (!completed) throw new ROOT_ERROR('上传会话状态已变更');
  const [file] = await transaction
    .update(schemas.files)
    .set({
      content_type: contentType,
      status: 'verified',
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(
      and(
        eq(schemas.files.file_id, session.file_id),
        eq(schemas.files.status, 'pending'),
      ),
    )
    .returning();
  if (!file) throw new ROOT_ERROR('数据异常');
  return file;
}
