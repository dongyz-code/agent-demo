import type { SQL, SQLChunk } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ */
/* trigger 声明类型                                                    */
/* ------------------------------------------------------------------ */

/** PostgreSQL trigger 支持的事件类型。 */
export type SchemaTriggerEvent = 'insert' | 'update' | 'delete' | 'truncate';

/** PostgreSQL trigger function 声明，和表结构一样属于数据库目标态。 */
export type SchemaTriggerFunction = {
  /** 函数名，不包含 schema。 */
  name: string;
  /** 函数所在 PostgreSQL schema；未传时使用数据库默认 schema。 */
  schemaName?: string;
  /** 函数参数定义，例如 old_name text；trigger 函数通常为空数组。 */
  args?: string[];
  /** 函数返回类型；trigger function 默认返回 trigger。 */
  returns?: string;
  /** 函数语言；默认 plpgsql。 */
  language?: string;
  /** 是否使用 create or replace function，默认启用以便修正函数体。 */
  replace?: boolean;
  /** 函数体，不包含外层 dollar quote。 */
  body: string;
};

/** PostgreSQL trigger 声明，目标表由本地 pgTable 自动补齐。 */
export type SchemaTrigger = {
  /** trigger 名称，同一张表内必须唯一。 */
  name: string;
  /** trigger 所在 Drizzle 表对象，由本地 pgTable 从声明位置推导。 */
  table: AnyPgTable;
  /** 触发时机。 */
  timing: 'before' | 'after' | 'instead of';
  /** 触发事件，多个事件会用 or 连接。 */
  events: [SchemaTriggerEvent, ...SchemaTriggerEvent[]];
  /** 触发粒度，默认 row。 */
  forEach?: 'row' | 'statement';
  /** when 条件 SQL，不包含外层 when 关键字。 */
  when?: string;
  /** 被执行的 trigger function schema 声明。 */
  execute: SchemaTriggerFunction;
  /** 传给 trigger function 的字符串参数。 */
  functionArgs?: string[];
  /** 是否先 drop trigger if exists 再创建，默认启用以便重复部署同一迁移代码。 */
  replace?: boolean;
};

/** trigger 在 pgTable 第三个参数中声明时尚未绑定目标表。 */
export type SchemaTriggerConfig = Omit<SchemaTrigger, 'table'>;

/** 单表结构扩展对象，包含该表声明中的 trigger function 和 trigger。 */
export type TableSchemaObjects = {
  /** 当前表声明中直接或间接引用的 trigger function。 */
  triggerFunctions: SchemaTriggerFunction[];
  /** 当前表声明中声明的 trigger，已自动绑定当前表。 */
  triggers: SchemaTrigger[];
};

/* ------------------------------------------------------------------ */
/* 表目标态描述类型，DDL 与表管理共用                                  */
/* ------------------------------------------------------------------ */

/** 目标态列描述，DDL 与表管理共用；sensitive/key 等展示属性由消费方投影追加。 */
export type TargetColumnDescriptor = {
  /** 数据库字段名。 */
  name: string;
  /** 字段 SQL 类型文本，取自 column.getSQLType()。 */
  sqlType: string;
  /** Drizzle dataType 标识。 */
  dataType: string;
  /** 是否不允许为空。 */
  notNull: boolean;
  /** 是否有默认值。 */
  hasDefault: boolean;
  /** 原始 default 值，供 DDL 渲染。 */
  default?: unknown;
  /** 是否为主键列。 */
  primaryKey: boolean;
};

/** 目标态索引描述，同时承载 DDL 字段（expressions/where/method）与结构摘要字段。 */
export type TargetIndexDescriptor = {
  /** 索引名称。 */
  name: string;
  /** 索引覆盖的字段名列表；表达式索引用占位文本表示。 */
  columns: string[];
  /** 是否唯一索引。 */
  unique: boolean;
  /** 是否表达式、动态 where 或其他无法安全还原的复杂索引。 */
  complex?: boolean;
  /** PostgreSQL 索引方法。 */
  method: string;
  /** 参与 create index 的字段或表达式 SQL 片段。 */
  expressions: SQLChunk[];
  /** 部分索引 where 条件。 */
  where?: SQL;
};

/** 表的完整目标态描述，由 Drizzle 表定义推导，DDL 与表管理共用。 */
export type TableTargetDescriptor = {
  /** Drizzle 表对象。 */
  table: AnyPgTable;
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** 数据库表名。 */
  tableName: string;
  /** 字段列表。 */
  columns: TargetColumnDescriptor[];
  /** 有序主键列名。 */
  primaryKey: string[];
  /** 索引列表。 */
  indexes: TargetIndexDescriptor[];
  /** 已绑表的 trigger 列表。 */
  triggers: SchemaTrigger[];
  /** 当前表声明引用的 trigger function 列表。 */
  triggerFunctions: SchemaTriggerFunction[];
};

/* ------------------------------------------------------------------ */
/* DDL target / option 类型                                             */
/* ------------------------------------------------------------------ */

/** Drizzle 表在 DDL 中的目标位置，可用于正式表、临时表或备份表。 */
export type TableDdlTarget = {
  /** Drizzle 表对象，提供字段、主键、索引等目标结构信息。 */
  table: AnyPgTable;
  /** PostgreSQL schema 名称；未传时使用数据库连接配置中的默认 schema。 */
  schemaName?: string;
  /** 要创建的真实表名；未传时使用 Drizzle 表定义中的表名。 */
  tableName?: string;
};

/** describeTableTarget 与 DDL 生成器共用的目标覆盖选项。 */
export type TableTargetOptions = TableDdlTarget;

/** 生成建表语句时可选的幂等策略。 */
export type CreateTableSqlOptions = TableDdlTarget & {
  /** 是否生成 create table if not exists，用于自管迁移重复执行保护。 */
  ifNotExists?: boolean;
};

/** 生成索引语句时可选的幂等、命名和复杂索引处理策略。 */
export type CreateIndexSqlOptions = TableDdlTarget & {
  /** 是否生成 create index if not exists，用于自管迁移重复执行保护。 */
  ifNotExists?: boolean;
  /** 是否跳过无法从 Drizzle 运行时结构安全还原的复杂索引。 */
  skipComplex?: boolean;
  /** 索引名前缀；表管理重建临时表时用于避开原表索引名冲突。 */
  indexNamePrefix?: string;
};

/** 生成 trigger 语句时可选的目标表覆盖策略，表管理重建临时表会使用。 */
export type CreateTriggerSqlOptions = {
  /** 要挂载 trigger 的 PostgreSQL schema；未传时从 trigger.table 推导。 */
  schemaName?: string;
  /** 要挂载 trigger 的真实表名；未传时从 trigger.table 推导。 */
  tableName?: string;
};

/** Drizzle index 运行时结构的轻量描述，供索引归一化内部使用。 */
export type DrizzleIndexConfig = {
  /** Drizzle 表定义中的索引名，缺省时按表名和字段名兜底生成。 */
  name?: string;
  /** 索引字段或表达式列表。 */
  columns: unknown[];
  /** 是否为唯一索引。 */
  unique: boolean;
  /** PostgreSQL 索引方法，Drizzle 缺省时按 btree 处理。 */
  method?: string;
  /** 部分索引条件；只有 SQL template 能被安全还原为 DDL。 */
  where?: unknown;
};

export type { PgTableExtraConfig, PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
