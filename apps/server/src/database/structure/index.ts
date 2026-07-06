/**
 * 数据库结构子模块公共出口。
 *
 * 统一收口表声明捕获、目标态描述、live catalog 读取、结构差异比较、DDL 生成和启动期
 * 结构自检。具体表定义见 ../tables。
 */

export {
  pgTable,
  trigger,
  triggerFunction,
  getTableSchemaObjects,
} from './declaration.js';

export {
  defaultDatabaseSchema,
  describeTableTarget,
  getTableDdlTarget,
  validateSqlIdentifier,
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

export { timestampsTrigger } from './presets.js';
export type { TimestampsTriggerOptions } from './presets.js';

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
  PgTableExtraConfig,
  PgTableExtraConfigValue,
  SchemaTrigger,
  SchemaTriggerConfig,
  SchemaTriggerEvent,
  SchemaTriggerFunction,
  TableDdlTarget,
  TableTargetDescriptor,
  TableSchemaObjects,
  TableTargetOptions,
} from './types.js';
