import type {
  TableColumnInfo,
  TableConstraintInfo,
  TableIndexInfo,
  TableStructureOpType,
} from '@repo/types';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

/** 表管理中允许被展示和操作的 schema 表快照。 */
export type ManagedTableSchema = {
  /** schemaTables 中的表 key。 */
  table: string;
  /** Drizzle 表对象。 */
  drizzleTable: AnyPgTable;
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** Drizzle schema 中的目标表名。 */
  tableName: string;
  /** 目标字段列表。 */
  columns: TableColumnInfo[];
  /** 目标索引列表。 */
  indexes: TableIndexInfo[];
};

/** 数据库 catalog 中读取到的真实表结构。 */
export type ManagedTableCatalog = {
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** 数据库真实表名。 */
  tableName: string;
  /** 表是否真实存在。 */
  exists: boolean;
  /** 数据库估算行数。 */
  estimatedRows: number | null;
  /** 真实字段列表。 */
  columns: TableColumnInfo[];
  /** 真实索引列表。 */
  indexes: TableIndexInfo[];
  /** 真实约束列表。 */
  constraints: TableConstraintInfo[];
};

/** 保存到操作记录表中的结构化计划内容。 */
export type StoredTablePlan = {
  /** 操作类型。 */
  type: TableStructureOpType;
  /** schemaTables 中的表 key。 */
  table: string;
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** Drizzle schema 中的目标表名。 */
  tableName: string;
  /** 数据库中的源表名。 */
  sourceTableName: string;
  /** 字段映射，key 为目标字段名，value 为源字段名。 */
  columnSourceMap: Record<string, string>;
  /** 执行时用于判断实态是否漂移的指纹。 */
  catalogFingerprint: string;
  /** reset 操作使用的新表名。 */
  temporaryTableName?: string;
  /** reset 操作保留的备份表名。 */
  backupTableName?: string;
};
