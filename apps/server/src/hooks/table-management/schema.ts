import { schema } from '@/database/index.js';
import { describeTable } from '@/database/schema/index.js';

import { isSensitiveColumn } from './sensitive.js';

import type { ManagedTableSchema } from './types.js';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

/** 返回所有允许表管理功能处理的 Drizzle 表 schema。 */
export function listManagedTableSchemas(): ManagedTableSchema[] {
  return Object.entries(schema.schemaTables).map(([table, drizzleTable]) =>
    getManagedTableSchema(table, drizzleTable as AnyPgTable),
  );
}

/** 根据 schemaTables key 返回单张表的 Drizzle 目标结构。 */
export function getManagedTableSchemaByKey(table: string) {
  const drizzleTable =
    schema.schemaTables[table as keyof typeof schema.schemaTables];
  if (!drizzleTable) {
    return;
  }
  return getManagedTableSchema(table, drizzleTable as AnyPgTable);
}

/** 断言并返回单张表的 Drizzle 目标结构。 */
export function assertManagedTableSchema(table: string) {
  const item = getManagedTableSchemaByKey(table);
  if (!item) {
    throw new Error(`未知表名: ${table}`);
  }
  return item;
}

/**
 * 将 Drizzle 表对象转换为表管理内部使用的结构快照。
 *
 * 字段、主键、索引、trigger 取自 describeTable 的统一描述；sensitive 属于展示关注点，
 * 在此业务投影层追加。table 是 schemaTables key，仅用于 UI/审计展示。
 */
function getManagedTableSchema(
  table: string,
  drizzleTable: AnyPgTable,
): ManagedTableSchema {
  const descriptor = describeTable(drizzleTable);

  const columns = descriptor.columns.map((column) => ({
    name: column.name,
    key: column.name,
    dataType: column.dataType,
    sqlType: column.sqlType,
    notNull: column.notNull,
    hasDefault: column.hasDefault,
    primaryKey: column.primaryKey,
    sensitive: isSensitiveColumn({
      name: column.name,
      sqlType: column.sqlType,
    }),
  }));

  const indexes = descriptor.indexes.map(
    ({ name, columns: indexColumns, unique, complex }) => ({
      name,
      columns: indexColumns,
      unique,
      complex,
    }),
  );

  return {
    table,
    drizzleTable,
    schemaName: descriptor.schemaName,
    tableName: descriptor.tableName,
    columns,
    indexes,
    triggers: descriptor.triggers,
  };
}
