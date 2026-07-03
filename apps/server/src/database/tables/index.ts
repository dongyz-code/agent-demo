import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

export * from './access.js';
export * from './log.js';
export * from './main.js';
export * from './structure.js';
export * from './system.js';
export * from './task.js';

import { role, user, user_role } from './access.js';
import { api_logs, user_logs } from './log.js';
import { table_structure_ops } from './structure.js';
import { apps, sys_conf } from './system.js';
import { tasks } from './task.js';

/** 允许表管理功能展示和操作的业务表白名单，不包含内部审计表。 */
export const schemaTables = {
  sys_conf,
  user,
  role,
  user_role,
  apps,
  tasks,
  api_logs,
  user_logs,
};

/** 所有需要落库的 Drizzle 表（含审计表），供启动期自检遍历。 */
export const databaseSchemaTables = [
  ...Object.values(schemaTables),
  table_structure_ops,
] satisfies AnyPgTable[];

/** 允许作为 schemaTables key 使用的表名联合类型。 */
export type Table = keyof typeof schemaTables;

/** 服务端内部读取数据库行时使用的 Drizzle select 推导类型。 */
export type SqlData = {
  [Key in keyof typeof schemaTables]: InferSelectModel<
    (typeof schemaTables)[Key]
  >;
};

/** 服务端内部写入数据库行时使用的 Drizzle insert 推导类型。 */
export type SqlInsertData = {
  [Key in keyof typeof schemaTables]: InferInsertModel<
    (typeof schemaTables)[Key]
  >;
};
