import { index, text, uuid } from 'drizzle-orm/pg-core';

import { timestamptz, varchar255 } from './columns.js';
import { pgTable } from './table.js';

import type {
  TableStructureOpStatus,
  TableStructureOpType,
} from '@repo/types';

export const table_structure_ops = pgTable(
  'table_structure_ops',
  {
    /** 操作记录 ID，用于 plan/apply 两阶段关联 */
    op_id: uuid('op_id').primaryKey(),
    /** 操作类型：重命名或 schema 重置 */
    type: varchar255('type').$type<TableStructureOpType>().notNull(),
    /** 操作状态，用于审计和失败恢复 */
    status: varchar255('status').$type<TableStructureOpStatus>().notNull(),
    /** schemaTables 中的表 key */
    table_key: varchar255('table_key').notNull(),
    /** PostgreSQL schema 名称 */
    table_schema: varchar255('table_schema').notNull(),
    /** Drizzle schema 中的目标表名 */
    target_table_name: varchar255('target_table_name').notNull(),
    /** 数据库中的源表名 */
    source_table_name: varchar255('source_table_name').notNull(),
    /** 计划内容 JSON，apply 阶段只读取服务端保存的计划 */
    plan: text('plan').notNull(),
    /** SQL 摘要 JSON，仅用于展示和审计 */
    sql_preview: text('sql_preview').notNull(),
    /** 风险提示 JSON */
    warnings: text('warnings'),
    /** 阻塞项 JSON，非空时 apply 不允许执行 */
    blockers: text('blockers'),
    /** reset 操作保留的备份表名 */
    backup_table_name: varchar255('backup_table_name'),
    /** 执行失败时的错误信息 */
    error: text('error'),
    /** 计划创建用户 ID */
    create_user_id: varchar255('create_user_id').notNull(),
    /** 计划创建时间 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
    /** 计划过期时间 */
    expire_timestamp: timestamptz('expire_timestamp').notNull(),
    /** 执行用户 ID */
    apply_user_id: varchar255('apply_user_id'),
    /** 执行开始时间 */
    start_timestamp: timestamptz('start_timestamp'),
    /** 执行结束时间 */
    end_timestamp: timestamptz('end_timestamp'),
  },
  (table) => [
    index('table_structure_ops_type_idx').on(table.type),
    index('table_structure_ops_status_idx').on(table.status),
    index('table_structure_ops_table_key_idx').on(table.table_key),
    index('table_structure_ops_create_timestamp_idx').on(table.create_timestamp),
  ],
);
