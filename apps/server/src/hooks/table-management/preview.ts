import { ROOT_ERROR } from '@/configs/index.js';
import { db, sql } from '@/database/index.js';

import { maskPreviewValue } from './sensitive.js';

import type { TablePreview } from '@repo/types';
import type { ManagedTableCatalog, ManagedTableSchema } from './types.js';

/** 读取单表 demo 数据，限制行数且只返回注册字段。 */
export async function getTablePreview({
  schemaTable,
  catalogTable,
  offset = 0,
  limit = 20,
}: {
  /** Drizzle schema 目标结构。 */
  schemaTable: ManagedTableSchema;
  /** Postgres catalog 真实结构。 */
  catalogTable: ManagedTableCatalog;
  /** 起始行偏移。 */
  offset?: number;
  /** 返回行数，上限 100。 */
  limit?: number;
}): Promise<TablePreview> {
  if (!catalogTable.exists) {
    throw new ROOT_ERROR('非法参数');
  }

  const catalogColumnNames = new Set(
    catalogTable.columns.map((column) => column.name),
  );
  const columns = schemaTable.columns.filter((column) =>
    catalogColumnNames.has(column.name),
  );

  if (!columns.length) {
    return {
      table: schemaTable.table,
      columns: [],
      rows: [],
      offset,
      limit: 0,
    };
  }

  const safeOffset = Math.max(0, Number.isFinite(offset) ? offset : 0);
  const safeLimit = Math.max(1, Math.min(100, Number.isFinite(limit) ? limit : 20));
  const orderColumn =
    columns.find((column) => column.primaryKey) ??
    columns.find((column) => column.name === 'create_timestamp') ??
    columns[0]!;
  const rowsResult = await db.execute<Record<string, unknown>>(sql`
    select ${sql.join(
      columns.map((column) => sql.identifier(column.name)),
      sql`, `,
    )}
    from ${sql.identifier(schemaTable.schemaName)}.${sql.identifier(schemaTable.tableName)}
    order by ${sql.identifier(orderColumn.name)}
    offset ${safeOffset}
    limit ${safeLimit}
  `);

  return {
    table: schemaTable.table,
    columns: columns.map((column) => ({
      name: column.name,
      sqlType: column.sqlType,
      masked: Boolean(column.sensitive),
    })),
    rows: rowsResult.rows.map((row) => {
      return Object.fromEntries(
        columns.map((column) => [
          column.name,
          maskPreviewValue({
            name: column.name,
            sqlType: column.sqlType,
            value: row[column.name],
          }),
        ]),
      );
    }),
    offset: safeOffset,
    limit: safeLimit,
  };
}
