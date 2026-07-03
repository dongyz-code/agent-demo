import { getTableCatalog } from '@/database/introspection/index.js';

import { assertManagedTableSchema } from './schema.js';

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
