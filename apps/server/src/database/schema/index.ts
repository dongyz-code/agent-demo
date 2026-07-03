/**
 * schema 基础设施子模块公共出口。
 *
 * 统一收口 schema 基础设施：表声明（pgTable）、trigger 捕获、表描述（describeTable）、
 * DDL 生成（createXxxSql）、内置 trigger 预设（timestampsTrigger）。migrations 与表管理
 * hooks 均从此处引入，避免表结构推导逻辑散落到多个消费者。具体表定义见 ../tables。
 */

export {
  pgTable,
  trigger,
  triggerFunction,
  getTableSchemaObjects,
} from './declaration.js';

export {
  defaultDatabaseSchema,
  describeTable,
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

export type {
  ColumnDescriptor,
  CreateIndexSqlOptions,
  CreateTableSqlOptions,
  CreateTriggerSqlOptions,
  DrizzleIndexConfig,
  IndexDescriptor,
  PgTableExtraConfig,
  PgTableExtraConfigValue,
  SchemaTrigger,
  SchemaTriggerConfig,
  SchemaTriggerEvent,
  SchemaTriggerFunction,
  TableDdlTarget,
  TableDescriptor,
  TableSchemaObjects,
  TableTargetOptions,
} from './types.js';
