import { ROOT_ERROR } from '@/configs/index.js';
import { db } from '@/database/index.js';
import { sql } from 'drizzle-orm';

import { maskPreviewValue } from './sensitive.js';

import type { TablePreview } from '@repo/types';
import type { ManagedTableSchema } from './types.js';
import type { TableCatalogSnapshot } from '@/database/structure/index.js';

/** 读取单表数据预览，按分页返回注册字段并保留脱敏逻辑。 */
export async function getTablePreview({
  schemaTable,
  catalogTable,
  offset = 0,
  limit = 20,
}: {
  /** Drizzle 目标态结构。 */
  schemaTable: ManagedTableSchema;
  /** Postgres catalog 真实结构。 */
  catalogTable: TableCatalogSnapshot;
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
      count: 0,
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
  const countResult = await db.execute<{ count: number }>(sql`
    select count(*)::int as count
    from ${sql.identifier(schemaTable.schemaName)}.${sql.identifier(schemaTable.tableName)}
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
    count: countResult.rows[0]?.count ?? 0,
    offset: safeOffset,
    limit: safeLimit,
  };
}
