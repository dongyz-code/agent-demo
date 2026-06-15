import { db, sql } from '@/database/index.js';

import { isSensitiveColumn } from './sensitive.js';

import type {
  TableColumnInfo,
  TableConstraintInfo,
  TableIndexInfo,
} from '@repo/types';
import type { ManagedTableCatalog } from './types.js';

type CatalogTableRow = {
  estimated_rows: number;
};

type CatalogColumnRow = {
  name: string;
  sql_type: string;
  not_null: boolean;
  default_value: string | null;
  primary_key: boolean;
};

type CatalogIndexRow = {
  name: string;
  definition: string;
};

type CatalogConstraintRow = {
  name: string;
  type: string;
  definition: string;
  columns: string[] | null;
};

/** 读取指定表的数据库真实结构，表不存在时返回空结构。 */
export async function getTableCatalog({
  schemaName,
  tableName,
}: {
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** 数据库表名。 */
  tableName: string;
}): Promise<ManagedTableCatalog> {
  const tableResult = await db.execute<CatalogTableRow>(sql`
    select c.reltuples::bigint as estimated_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${schemaName}
      and c.relname = ${tableName}
      and c.relkind in ('r', 'p')
    limit 1
  `);
  const tableRow = tableResult.rows[0];

  if (!tableRow) {
    return {
      schemaName,
      tableName,
      exists: false,
      estimatedRows: null,
      columns: [],
      indexes: [],
      constraints: [],
    };
  }

  const [columns, indexes, constraints] = await Promise.all([
    getCatalogColumns({ schemaName, tableName }),
    getCatalogIndexes({ schemaName, tableName }),
    getCatalogConstraints({ schemaName, tableName }),
  ]);

  return {
    schemaName,
    tableName,
    exists: true,
    estimatedRows: Number(tableRow.estimated_rows),
    columns,
    indexes,
    constraints,
  };
}

/** 读取指定表的真实字段列表。 */
async function getCatalogColumns({
  schemaName,
  tableName,
}: {
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** 数据库表名。 */
  tableName: string;
}): Promise<TableColumnInfo[]> {
  const result = await db.execute<CatalogColumnRow>(sql`
    select
      a.attname as name,
      format_type(a.atttypid, a.atttypmod) as sql_type,
      a.attnotnull as not_null,
      pg_get_expr(d.adbin, d.adrelid) as default_value,
      exists (
        select 1
        from pg_index i
        where i.indrelid = c.oid
          and i.indisprimary
          and a.attnum = any(i.indkey)
      ) as primary_key
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = ${schemaName}
      and c.relname = ${tableName}
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
    order by a.attnum
  `);

  return result.rows.map((row) => ({
    name: row.name,
    sqlType: row.sql_type,
    notNull: row.not_null,
    hasDefault: row.default_value !== null,
    defaultValue: row.default_value,
    primaryKey: row.primary_key,
    sensitive: isSensitiveColumn({
      name: row.name,
      sqlType: row.sql_type,
    }),
  }));
}

/** 读取指定表的真实索引列表。 */
async function getCatalogIndexes({
  schemaName,
  tableName,
}: {
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** 数据库表名。 */
  tableName: string;
}): Promise<TableIndexInfo[]> {
  const result = await db.execute<CatalogIndexRow>(sql`
    select indexname as name, indexdef as definition
    from pg_indexes
    where schemaname = ${schemaName}
      and tablename = ${tableName}
    order by indexname
  `);

  return result.rows.map((row) => {
    const columns = parseIndexColumns(row.definition);
    return {
      name: row.name,
      columns,
      unique: /\bunique\b/i.test(row.definition),
      complex:
        columns.some((column) => column.includes('(')) ||
        /\bwhere\b/i.test(row.definition) ||
        !/\busing\s+btree\b/i.test(row.definition),
    };
  });
}

/** 读取指定表的真实约束列表。 */
async function getCatalogConstraints({
  schemaName,
  tableName,
}: {
  /** PostgreSQL schema 名称。 */
  schemaName: string;
  /** 数据库表名。 */
  tableName: string;
}): Promise<TableConstraintInfo[]> {
  const result = await db.execute<CatalogConstraintRow>(sql`
    select
      con.conname as name,
      con.contype as type,
      pg_get_constraintdef(con.oid) as definition,
      array_remove(array_agg(att.attname order by ord.ordinality), null) as columns
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    left join unnest(con.conkey) with ordinality as ord(attnum, ordinality) on true
    left join pg_attribute att on att.attrelid = c.oid and att.attnum = ord.attnum
    where n.nspname = ${schemaName}
      and c.relname = ${tableName}
    group by con.oid, con.conname, con.contype
    order by con.conname
  `);

  return result.rows.map((row) => ({
    name: row.name,
    type: constraintTypeMap[row.type] ?? row.type,
    columns: row.columns ?? [],
    definition: row.definition,
    complex: !['p', 'u'].includes(row.type),
  }));
}

const constraintTypeMap: Record<string, string> = {
  p: 'PRIMARY KEY',
  u: 'UNIQUE',
  f: 'FOREIGN KEY',
  c: 'CHECK',
  x: 'EXCLUSION',
};

/** 从 pg_indexes.indexdef 中提取索引字段列表。 */
function parseIndexColumns(definition: string) {
  const match = definition.match(/\busing\s+\S+\s+\((.*)\)(?:\s+where\s+.*)?$/i);
  if (!match) {
    return ['<expression>'];
  }

  return match[1]
    .split(',')
    .map((column) => column.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}
