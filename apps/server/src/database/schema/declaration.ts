import { getTableConfig, pgTable as drizzlePgTable } from 'drizzle-orm/pg-core';

import type {
  BuildColumns,
  BuildExtraConfigColumns,
} from 'drizzle-orm/column-builder';
import type {
  AnyPgTable,
  PgColumnBuilderBase,
  PgTableExtraConfigValue,
  PgTableWithColumns,
} from 'drizzle-orm/pg-core';
import type { PgColumnsBuilders } from 'drizzle-orm/pg-core/columns/all';
import type {
  SchemaTrigger,
  SchemaTriggerConfig,
  SchemaTriggerFunction,
  TableSchemaObjects,
} from './types.js';

/** 本地 pgTable 第三个参数允许返回的扩展值（Drizzle 原生 extra config + trigger 声明）。 */
type SchemaTableExtraConfigValue =
  | PgTableExtraConfigValue
  | SchemaTriggerFunctionDefinition
  | SchemaTriggerDefinition;

/** 本地 pgTable 第三个参数允许返回的数组形式。 */
type SchemaTableExtraConfig = SchemaTableExtraConfigValue[];

/** 标记本地 schema 扩展对象，避免误传给 Drizzle。 */
const schemaExtraKind = Symbol('schemaExtraKind');

/** 记录每个 Drizzle 表对象上由本地 pgTable 捕获到的 schema 扩展。 */
const tableSchemaObjects = new WeakMap<AnyPgTable, TableSchemaObjects>();

/** 带有内部标记的 trigger function 声明。 */
type SchemaTriggerFunctionDefinition = SchemaTriggerFunction & {
  /** 内部标记，用于从 Drizzle extra config 中拆出 schema 扩展。 */
  [schemaExtraKind]: 'triggerFunction';
};

/** 带有内部标记且尚未绑定 table 的 trigger 声明。 */
type SchemaTriggerDefinition = SchemaTriggerConfig & {
  /** 内部标记，用于从 Drizzle extra config 中拆出 schema 扩展。 */
  [schemaExtraKind]: 'trigger';
};

/** 本地 pgTable 类型，保留 Drizzle 字段推导，同时允许第三个参数返回 trigger/function。 */
type SchemaPgTableFn = {
  <
    TTableName extends string,
    TColumnsMap extends Record<string, PgColumnBuilderBase>,
  >(
    name: TTableName,
    columns: TColumnsMap,
    extraConfig?: (
      self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>,
    ) => SchemaTableExtraConfig,
  ): PgTableWithColumns<{
    name: TTableName;
    schema: undefined;
    columns: BuildColumns<TTableName, TColumnsMap, 'pg'>;
    dialect: 'pg';
  }>;
  <
    TTableName extends string,
    TColumnsMap extends Record<string, PgColumnBuilderBase>,
  >(
    name: TTableName,
    columns: (columnTypes: PgColumnsBuilders) => TColumnsMap,
    extraConfig?: (
      self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>,
    ) => SchemaTableExtraConfig,
  ): PgTableWithColumns<{
    name: TTableName;
    schema: undefined;
    columns: BuildColumns<TTableName, TColumnsMap, 'pg'>;
    dialect: 'pg';
  }>;
};

/**
 * 本地表定义入口，兼容 Drizzle pgTable，并在第三个参数中额外识别 trigger/function。
 *
 * @param name PostgreSQL 表名。
 * @param columns Drizzle 字段定义或字段定义工厂。
 * @param extraConfig 索引、约束、trigger function 和 trigger 的同处声明。
 * @returns Drizzle 表对象，字段类型推导与原生 pgTable 保持一致。
 */
export const pgTable: SchemaPgTableFn = ((
  name: string,
  columns: unknown,
  extraConfig?: (self: unknown) => SchemaTableExtraConfig,
) => {
  let table: AnyPgTable;
  const wrappedExtraConfig = extraConfig
    ? (self: unknown) => {
        const values = extraConfig(self);
        const { drizzleExtras, schemaObjects } = splitExtraConfig({
          table,
          values,
        });
        tableSchemaObjects.set(table, schemaObjects);
        return drizzleExtras;
      }
    : undefined;

  table = drizzlePgTable(
    name,
    columns as Parameters<typeof drizzlePgTable>[1],
    wrappedExtraConfig as unknown as Parameters<typeof drizzlePgTable>[2],
  ) as AnyPgTable;
  tableSchemaObjects.set(table, { triggerFunctions: [], triggers: [] });
  return table;
}) as SchemaPgTableFn;

/** 定义 trigger function，可直接放进 pgTable 第三个参数或被 trigger.execute 引用。 */
export function triggerFunction<T extends SchemaTriggerFunction>(config: T) {
  return {
    ...config,
    [schemaExtraKind]: 'triggerFunction',
  } as T & SchemaTriggerFunctionDefinition;
}

/** 定义 trigger，必须放在对应表的 pgTable 第三个参数中。 */
export function trigger<T extends SchemaTriggerConfig>(config: T) {
  return {
    ...config,
    [schemaExtraKind]: 'trigger',
  } as T & SchemaTriggerDefinition;
}

/** 读取某张表上由本地 pgTable 声明的 trigger function 和 trigger。 */
export function getTableSchemaObjects(table: AnyPgTable) {
  getTableConfig(table);
  return (
    tableSchemaObjects.get(table) ?? {
      triggerFunctions: [],
      triggers: [],
    }
  );
}

/** 将 pgTable 第三个参数拆为 Drizzle 能理解的部分和本地 schema 扩展部分。 */
function splitExtraConfig({
  table,
  values,
}: {
  /** 当前正在解析的 Drizzle 表对象。 */
  table: AnyPgTable;
  /** 本地 pgTable 第三个参数返回的全部扩展值。 */
  values: SchemaTableExtraConfig;
}) {
  const drizzleExtras: PgTableExtraConfigValue[] = [];
  const triggerFunctions = new Map<string, SchemaTriggerFunction>();
  const triggers: SchemaTrigger[] = [];

  values.flat(1).forEach((item) => {
    if (isTriggerFunctionDefinition(item)) {
      triggerFunctions.set(getTriggerFunctionKey(item), item);
      return;
    }
    if (isTriggerDefinition(item)) {
      triggerFunctions.set(getTriggerFunctionKey(item.execute), item.execute);
      triggers.push({ ...item, table });
      return;
    }
    drizzleExtras.push(item);
  });

  return {
    drizzleExtras,
    schemaObjects: {
      triggerFunctions: [...triggerFunctions.values()],
      triggers,
    },
  };
}

/** 判断 extra config 值是否为 trigger function 声明。 */
function isTriggerFunctionDefinition(
  value: unknown,
): value is SchemaTriggerFunctionDefinition {
  return getSchemaExtraKind(value) === 'triggerFunction';
}

/** 判断 extra config 值是否为 trigger 声明。 */
function isTriggerDefinition(
  value: unknown,
): value is SchemaTriggerDefinition {
  return getSchemaExtraKind(value) === 'trigger';
}

/** 读取本地 schema 扩展对象的内部标记，普通 Drizzle builder 会返回 undefined。 */
function getSchemaExtraKind(value: unknown) {
  if (!value || typeof value !== 'object') {
    return;
  }
  return (value as { [schemaExtraKind]?: string })[schemaExtraKind];
}

/** 返回 trigger function 的稳定去重键，schema 为空时按默认 schema 处理。 */
function getTriggerFunctionKey(item: SchemaTriggerFunction) {
  return `${item.schemaName ?? ''}.${item.name}`;
}
