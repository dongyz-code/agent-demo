import {
  defaultDatabaseSchema,
  getDrizzleTableIndexes,
} from '@/database/ddl.js';
import { schema } from '@/database/index.js';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { isSensitiveColumn } from './sensitive.js';

import type { ManagedTableSchema } from './types.js';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

/** 默认 PostgreSQL schema 名称，Drizzle 未指定 schema 时使用数据库连接配置。 */
export const defaultTableSchema = defaultDatabaseSchema;

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

/** 将 Drizzle 表对象转换为表管理内部使用的结构快照。 */
function getManagedTableSchema(
  table: string,
  drizzleTable: AnyPgTable,
): ManagedTableSchema {
  const config = getTableConfig(drizzleTable);
  const tableName = config.name;
  const schemaName = config.schema ?? defaultTableSchema;
  const primaryColumns = new Set(
    config.primaryKeys.flatMap((item) =>
      item.columns.map((column) => column.name),
    ),
  );

  const columns = config.columns.map((column) => {
    const sqlType = column.getSQLType();
    const primaryKey = column.primary || primaryColumns.has(column.name);
    return {
      name: column.name,
      key: column.name,
      dataType: column.dataType,
      sqlType,
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      primaryKey,
      sensitive: isSensitiveColumn({ name: column.name, sqlType }),
    };
  });

  return {
    table,
    drizzleTable,
    schemaName,
    tableName,
    columns,
    indexes: getDrizzleTableIndexes({ table: drizzleTable, tableName }),
    triggers: schema.databaseSchemaObjects.triggers.filter(
      (item) => item.table === drizzleTable,
    ),
  };
}
