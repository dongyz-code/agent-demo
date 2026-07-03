import {
  boolean,
  index,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, timestamptz, varchar255 } from './columns.js';
import { pgTable } from './table.js';

export const sys_conf = pgTable('sys_conf', {
  /** 配置ID */
  id: smallint('id').primaryKey(),
  /** 系统配置 */
  data: text('data').notNull(),
  /** 最近更新时间 */
  last_update_timestamp: timestamptz('last_update_timestamp').notNull(),
});

export const apps = pgTable(
  'apps',
  {
    /** 应用ID */
    id: smallint('id').primaryKey(),
    /** 应用名称 */
    name: varchar255('name').notNull(),
    /** 应用简介 */
    desc: text('desc'),
    /** 是否启用 */
    available: boolean('available').notNull(),
    /** 客户端ID */
    client_id: uuid('client_id').notNull(),
    /** 客户端密钥 */
    client_secret: varchar255('client_secret').notNull(),
    /** 最后登录时间 */
    last_login_timestamp: timestamptz('last_login_timestamp'),
    ...baseCols(),
  },
  (table) => [index('apps_client_id_idx').on(table.client_id)],
);
