import type { AnyPgTable } from 'drizzle-orm/pg-core';

/* ------------------------------------------------------------------ */
/* trigger 声明类型（表定义层）                                         */
/*                                                                    */
/* 这里的类型描述 trigger / schema 扩展声明，属于"表定义"层：由         */
/* ./declaration.js、./presets.js 消费；迁移层（structure/）只读取。    */
/* 迁移侧的目标态类型（TargetColumnDescriptor 等）留在 structure/types。 */
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

export type { PgTableExtraConfig, PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
