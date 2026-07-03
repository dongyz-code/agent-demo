import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import { db, pool } from './client.js';
import * as schema from './tables/index.js';

import type { AnyColumn, SQL } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

export { db, pool, schema, sql };

export const tableNames = Object.fromEntries(
  Object.keys(schema.schemaTables).map((key) => [key, key]),
) as Record<schema.Table, string>;

export type { Db } from './client.js';
export type { SqlData, SqlInsertData, Table } from './tables/index.js';

type FilterValue = string | number | boolean | Date | null;

export function listFilter<T extends FilterValue>(
  column: AnyColumn,
  value: T | T[] | undefined,
) {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return sql`false`;
    }
    return inArray(column, value);
  }
  if (value === null) {
    return isNull(column);
  }
  return eq(column, value);
}

export function rangeFilter(
  column: AnyColumn,
  range: (Date | null)[] | undefined,
) {
  if (!range) {
    return undefined;
  }
  const [start, end] = range;
  return and(start ? gte(column, start) : undefined, end ? lte(column, end) : undefined);
}

export function searchFilter(search: string | undefined, columns: AnyColumn[]) {
  if (!search) {
    return undefined;
  }
  return or(...columns.map((column) => ilike(column, `%${search}%`)));
}

export function whereAll(...conditions: (SQL | undefined)[]) {
  return and(...conditions);
}

export function orderByAsc(column: AnyColumn) {
  return asc(column);
}

export function orderByDesc(column: AnyColumn) {
  return desc(column);
}

export async function countRows(table: AnyPgTable, where?: SQL) {
  const [row] = await db
    .select({ count: count() })
    .from(table)
    .where(where);
  return row?.count ?? 0;
}
