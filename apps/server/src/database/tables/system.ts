import {
  boolean,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, timestamptz, varchar255 } from './columns.js';
import { pgTable } from '../schema/index.js';

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
  /** client_id 是鉴权凭证，每次 API 鉴权按它查且必须唯一 */
  (table) => [uniqueIndex('apps_client_id_unique').on(table.client_id)],
);
