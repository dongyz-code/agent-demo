import type { TableColumnInfo, TableIndexInfo } from '@repo/types';
import type { SchemaTrigger } from '@/database/structure/types.js';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

/** 表管理中允许被展示和操作的 schema 表快照。 */
export type ManagedTableSchema = {
  /** managedTableRegistry 中的表 key。 */
  table: string;
  /** Drizzle 表对象。 */
  drizzleTable: AnyPgTable;
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** Drizzle 目标态中的目标表名。 */
  tableName: string;
  /** 目标字段列表。 */
  columns: TableColumnInfo[];
  /** 目标索引列表。 */
  indexes: TableIndexInfo[];
  /** 目标 trigger 列表，用于 schema reset 后恢复自动化数据库行为。 */
  triggers: SchemaTrigger[];
};

/** 计划内容的公共字段。 */
type StoredTablePlanBase = {
  /** managedTableRegistry 中的表 key。 */
  table: string;
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** Drizzle 目标态中的目标表名。 */
  tableName: string;
  /** 数据库中的源表名。 */
  sourceTableName: string;
  /** 执行时用于判断实态是否漂移的指纹。 */
  catalogFingerprint: string;
};

/** reset 计划：重建表结构并迁移数据。 */
export type StoredResetPlan = StoredTablePlanBase & {
  /** 操作类型。 */
  type: 'reset';
  /** 字段映射，key 为目标字段名，value 为源字段名。 */
  columnSourceMap: Record<string, string>;
  /** reset 操作使用的新表名。 */
  temporaryTableName?: string;
  /** reset 操作保留的备份表名。 */
  backupTableName?: string;
};

/** sync 计划：幂等补建缺失索引 + 同步 trigger，不动数据。 */
export type StoredSyncPlan = StoredTablePlanBase & {
  /** 操作类型。 */
  type: 'sync';
  /** 计划生成时缺失的索引名列表，用于展示与审计。 */
  missingIndexes: string[];
};

/** 保存到操作记录表中的结构化计划内容，按操作类型判别。 */
export type StoredTablePlan = StoredResetPlan | StoredSyncPlan;
