import { and, eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';

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
export async function getOwnedUploadSession(
  sessionId: string,
  userId: string,
) {
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

/**
 * 查询上传流程内部使用的源文件行。
 *
 * @param fileId 上传会话绑定的内部文件标识。
 * @returns 尚未删除的文件数据库行。
 */
export async function getUploadSourceFile(fileId: string) {
  const [file] = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.file_id, fileId))
    .limit(1);
  if (!file || file.status === 'deleted') {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'UPLOAD_SESSION_NOT_FOUND: 文件不存在',
    );
  }
  return file;
}

/**
 * 校验会话当前允许继续执行对象传输操作。
 *
 * @param session 上传会话数据库行。
 * @returns 校验通过时无返回值。
 */
export function assertTransferableUploadSession(
  session: typeof schema.file_upload_sessions.$inferSelect,
): void {
  if (session.expire_timestamp.getTime() <= Date.now()) {
    throw new ROOT_ERROR('非法参数', 'UPLOAD_SESSION_EXPIRED: 上传会话已过期');
  }
  if (!transferableStatuses.has(session.status)) {
    throw new ROOT_ERROR(
      '数据异常',
      `UPLOAD_SESSION_STATE_CONFLICT: 当前状态不允许上传：${session.status}`,
    );
  }
}

/**
 * 解析上传会话保存的知识库标识集合。
 *
 * @param value 数据库中保存的 JSON 字符串。
 * @returns 去重后的合法字符串标识。
 */
export function parseUploadDatasetIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter((item): item is string => typeof item === 'string'),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}
