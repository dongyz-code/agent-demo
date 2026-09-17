import { db, schemas } from '@/database/index.js';
import { randomUUID } from 'node:crypto';
import type { LogConf, LogType } from './static.js';

export * from './static.js';

/** ----------------- LOG  ---------------------- */

type Opt<T extends LogType> = {
  key: T;
  /** 操作用户 ID */
  user_id: string;
  ip: string;
  /** 用于检索 */
  search_key?: string;
} & (LogConf[T] extends {
  detail: unknown;
}
  ? Pick<LogConf[T], 'detail'>
  : {});

/** 添加用户日志 */
export async function addUserLog<T extends LogType>({
  key,
  user_id,
  ip,
  search_key,
  ...rest
}: Opt<T>) {
  const item: typeof schemas.user_logs.$inferInsert = {
    id: randomUUID(),
    user_id,
    key,
    ip,
    detail: 'detail' in rest ? JSON.stringify(rest.detail) : null,
    search_key: search_key ?? null,
    timestamp: new Date(),
  };
  await db.insert(schemas.user_logs).values(item);
}
