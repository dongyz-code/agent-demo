import { index, integer, text, uuid } from 'drizzle-orm/pg-core';

import { timestamptz, varchar255 } from './columns.js';
import { pgTable } from '../schema/index.js';

import type { InterfaceMode, InterfaceStatus } from '@repo/types';

export const api_logs = pgTable(
  'api_logs',
  {
    /** 唯一ID */
    id: uuid('id').primaryKey(),
    /** API 调用模式：主动发起或被动接收 */
    mode: varchar255('mode').$type<InterfaceMode>().notNull(),
    /** 应用ID，被动发起才有值 */
    client_id: uuid('client_id'),
    /** 通信标识，表示和哪个系统交互，主动发起才有值 */
    client_mark: varchar255('client_mark'),
    /** 请求URL */
    url: text('url'),
    /** 操作结果 */
    status: varchar255('status').$type<InterfaceStatus>(),
    /** 主动发起记录 localhost 或发起人 IP，被动接收记录 IP */
    ip: varchar255('ip'),
    /** 主动请求关联的用户ID */
    user_id: uuid('user_id'),
    /** 用于快速检索的 KEY（ID） */
    search_key: text('search_key'),
    /** 操作详情 */
    detail: text('detail'),
    /** 操作开始时间 */
    start_timestamp: timestamptz('start_timestamp').notNull(),
    /** 操作结束时间 */
    end_timestamp: timestamptz('end_timestamp'),
    /** 响应时间，毫秒单位 */
    duration: integer('duration'),
  },
  (table) => [
    index('api_logs_mode_idx').on(table.mode),
    index('api_logs_client_id_idx').on(table.client_id),
    index('api_logs_client_mark_idx').on(table.client_mark),
    index('api_logs_url_idx').on(table.url),
    index('api_logs_status_idx').on(table.status),
    index('api_logs_ip_idx').on(table.ip),
    index('api_logs_user_id_idx').on(table.user_id),
    /** 列表按时间范围过滤并倒序翻页 */
    index('api_logs_start_timestamp_idx').on(table.start_timestamp),
  ],
);

export const user_logs = pgTable(
  'user_logs',
  {
    /** 日志ID */
    id: uuid('id').primaryKey(),
    /** 用户ID */
    user_id: uuid('user_id'),
    /** 操作类型 */
    key: varchar255('key').notNull(),
    /** IP地址 */
    ip: varchar255('ip').notNull(),
    /** 用于快速检索的 KEY（ID） */
    search_key: text('search_key'),
    /** 操作详情 */
    detail: text('detail'),
    /** 操作时间 */
    timestamp: timestamptz('timestamp').notNull(),
  },
  (table) => [
    index('user_logs_user_id_idx').on(table.user_id),
    index('user_logs_key_idx').on(table.key),
    index('user_logs_ip_idx').on(table.ip),
    /** 列表按时间范围过滤并倒序翻页 */
    index('user_logs_timestamp_idx').on(table.timestamp),
  ],
);
