/**
 * 数据库迁移层出口：目标态描述、live catalog 读取、结构差异比较、DDL 生成和启动期结构自检。
 *
 * 表定义层 primitives（pgTable / timestampsTrigger / declaration / presets）已移至 tables/，
 * 本桶只导出迁移/管理层模块。表定义不 import 本桶，从结构上断开"表定义 ↔ 迁移"循环依赖。
 */
export {
  defaultDatabaseSchema,
  describeTableTarget,
  getTableDdlTarget,
} from './descriptor.js';
export type { DescribeTableOptions } from './descriptor.js';

export {
  createSchemaSql,
  createTableSql,
  createTableIndexSqls,
  createTriggerFunctionSql,
  createTriggerSqls,
  quoteIdent,
  quoteQualified,
} from './ddl.js';

export {
  createCatalogFingerprint,
  getTableCatalogSnapshot,
} from './catalog.js';
export type {
  CatalogColumnSnapshot,
  CatalogConstraintSnapshot,
  CatalogIndexSnapshot,
  TableCatalogSnapshot,
} from './catalog.js';

export { compareTableStructure, normalizeSqlType } from './diff.js';
export type {
  DiffSchemaSide,
  TableStructureDiffItem,
  TableStructureDiffLevel,
} from './diff.js';

export { startupTableStructureSync } from './startup-sync.js';

export type {
  TargetColumnDescriptor,
  CreateIndexSqlOptions,
  CreateTableSqlOptions,
  CreateTriggerSqlOptions,
  DrizzleIndexConfig,
  TargetIndexDescriptor,
  TableDdlTarget,
  TableTargetDescriptor,
  TableTargetOptions,
} from './types.js';
