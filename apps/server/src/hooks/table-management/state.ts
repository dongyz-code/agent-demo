import { getTableCatalog } from './catalog.js';
import { assertManagedTableSchema } from './schema.js';

import type { ManagedTableCatalog } from './types.js';

/** 读取单表 schema 和 catalog，权限由 router 层的单接口权限统一处理。 */
export async function getAuthorizedTableState({
  table,
}: {
  /** schemaTables 中的表 key。 */
  table: string;
}) {
  const schemaTable = assertManagedTableSchema(table);
  const catalogTable = await getTableCatalog(schemaTable);
  return {
    schemaTable,
    catalogTable,
  };
}

/** 计算 catalog 指纹，用于 apply 前判断结构是否漂移。 */
export function createCatalogFingerprint({
  columns,
  indexes,
  constraints,
  exists,
}: ManagedTableCatalog) {
  return JSON.stringify({
    exists,
    columns: columns.map((column) => [
      column.name,
      column.sqlType,
      column.notNull,
      column.primaryKey,
    ]),
    indexes: indexes.map((index) => [
      index.name,
      index.columns,
      index.unique,
      index.complex,
    ]),
    constraints: constraints.map((constraint) => [
      constraint.name,
      constraint.type,
      constraint.columns,
      constraint.complex,
    ]),
  });
}
