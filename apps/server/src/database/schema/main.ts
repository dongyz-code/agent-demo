import {
  boolean,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, bytea, timestamptz, varchar255 } from './columns.js';

export const ai_app = pgTable(
  'ai_app',
  {
    /** 应用ID */
    id: uuid('id').primaryKey(),
    /** 应用域名 */
    domain: varchar255('domain').notNull(),
    /** 应用名称 */
    name: varchar255('name').notNull(),
    /** 应用简介 */
    desc: text('desc'),
    /** 是否启用 */
    available: boolean('available').notNull(),
    /** 版本哈希值，对应上传的 ZIP 文件 sha256 值 */
    deploy_hash: bytea('deploy_hash'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('ai_app_domain_unique').on(table.domain),
    index('ai_app_available_idx').on(table.available),
  ],
);

export const ai_app_version = pgTable(
  'ai_app_version',
  {
    /** 应用ID */
    id: uuid('id').notNull(),
    /** 版本哈希值，对应上传的 ZIP 文件 sha256 值 */
    hash: bytea('hash').primaryKey(),
    /** 版本名称 */
    name: varchar255('name').notNull(),
    /** 版本大小，单位：bytes */
    size: varchar255('size').notNull(),
    /** 版本创建时间 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
  },
  (table) => [index('ai_app_version_id_idx').on(table.id)],
);
