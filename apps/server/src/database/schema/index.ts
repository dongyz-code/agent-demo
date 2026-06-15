import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export * from './access.js';
export * from './log.js';
export * from './main.js';
export * from './structure.js';
export * from './system.js';
export * from './task.js';

import { role, user, user_role } from './access.js';
import { api_logs, user_logs } from './log.js';
import { ai_app, ai_app_version } from './main.js';
import { apps, sys_conf } from './system.js';
import { tasks } from './task.js';

export const schemaTables = {
  sys_conf,
  user,
  role,
  user_role,
  apps,
  tasks,
  api_logs,
  user_logs,
  ai_app,
  ai_app_version,
};

export type Table = keyof typeof schemaTables;

export type SqlData = {
  [Key in keyof typeof schemaTables]: InferSelectModel<
    (typeof schemaTables)[Key]
  >;
};

export type SqlInsertData = {
  [Key in keyof typeof schemaTables]: InferInsertModel<
    (typeof schemaTables)[Key]
  >;
};
