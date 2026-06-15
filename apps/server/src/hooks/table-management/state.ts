import { getTableCatalog } from './catalog.js';
import { assertTablePermission, getTablePermissionContext } from './permissions.js';
import { assertManagedTableSchema } from './schema.js';

import type { TablePermissionAction } from '@repo/types';

/** 读取单表 schema 和 catalog，并完成权限校验。 */
export async function getAuthorizedTableState({
  user_id,
  table,
  action,
}: {
  /** 当前用户 ID。 */
  user_id: string;
  /** schemaTables 中的表 key。 */
  table: string;
  /** 当前操作动作。 */
  action: TablePermissionAction;
}) {
  const context = await getTablePermissionContext(user_id);
  assertTablePermission({ context, table, action });
  const schemaTable = assertManagedTableSchema(table);
  const catalogTable = await getTableCatalog(schemaTable);
  return {
    context,
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
}: Awaited<ReturnType<typeof getTableCatalog>>) {
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
