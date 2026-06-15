import { db, schema } from '@/database/index.js';
import { randomUUID } from 'node:crypto';
import { ROOT } from '@/configs/env.js';

import type { SqlInsertData } from '@/database/index.js';
import type { LogConf, LogType } from './static.js';

export * from './static.js';

/** ----------------- LOG  ---------------------- */

type Opt<T extends LogType> = {
  key: T;
  /** 操作人(管理员为 null) */
  user_id: string | null;
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
  const item: SqlInsertData['user_logs'] = {
    id: randomUUID(),
    user_id: user_id === ROOT.SYS_ADMIN_USER_ID ? null : user_id,
    key,
    ip,
    detail: 'detail' in rest ? JSON.stringify(rest.detail) : null,
    search_key: search_key ?? null,
    timestamp: new Date(),
  };
  await db.insert(schema.user_logs).values(item);
}
