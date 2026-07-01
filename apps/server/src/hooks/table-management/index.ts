import { countRows, db, schema, sql, whereAll } from '@/database/index.js';
import { desc, eq, inArray } from 'drizzle-orm';

import { getTableCatalog } from './catalog.js';
import { diffManagedTable } from './diff.js';
import { getManagedTableSchemaByKey, listManagedTableSchemas } from './schema.js';
import { getAuthorizedTableState } from './state.js';

import type {
  TableDetail,
  TableDiffLevel,
  TableListItem,
  TablePhysicalStatus,
  TableStructureOpStatus,
  TableStructureOpType,
} from '@repo/types';

export * from './catalog.js';
export * from './diff.js';
export * from './operations.js';
export * from './preview.js';
export * from './schema.js';
export * from './state.js';
export type * from './types.js';

/** 查询表管理列表。 */
export async function listVisibleTables({
  search,
  physicalStatus,
  diffLevel,
}: {
  /** 表名或 key 搜索关键词。 */
  search?: string;
  /** 物理状态筛选。 */
  physicalStatus?: TablePhysicalStatus;
  /** 差异级别筛选。 */
  diffLevel?: TableDiffLevel;
}): Promise<TableListItem[]> {
  const schemas = listManagedTableSchemas();
  const latestOperations = await getLatestOperationMap();
  const list: TableListItem[] = [];

  for (const schemaTable of schemas) {
    if (
      search &&
      ![schemaTable.table, schemaTable.tableName].some((value) =>
        value.toLowerCase().includes(search.toLowerCase()),
      )
    ) {
      continue;
    }

    const catalogTable = await getTableCatalog(schemaTable);
    const diff = diffManagedTable({ schemaTable, catalogTable });
    const item: TableListItem = {
      table: schemaTable.table,
      schemaName: schemaTable.schemaName,
      tableName: schemaTable.tableName,
      physicalStatus: catalogTable.exists ? 'exists' : 'missing',
      diffLevel: diff.level,
      columnCount: schemaTable.columns.length,
      estimatedRows: catalogTable.estimatedRows,
      latestOperation: latestOperations.get(schemaTable.table) ?? null,
    };

    if (physicalStatus && item.physicalStatus !== physicalStatus) {
      continue;
    }
    if (diffLevel && item.diffLevel !== diffLevel) {
      continue;
    }

    list.push(item);
  }

  return list;
}

/** 查询单表详情。 */
export async function getVisibleTableDetail({
  table,
}: {
  /** schemaTables 中的表 key。 */
  table: string;
}): Promise<TableDetail> {
  const { schemaTable, catalogTable } = await getAuthorizedTableState({ table });
  const diff = diffManagedTable({ schemaTable, catalogTable });

  return {
    table: schemaTable.table,
    schemaName: schemaTable.schemaName,
    tableName: schemaTable.tableName,
    physicalStatus: catalogTable.exists ? 'exists' : 'missing',
    diffLevel: diff.level,
    schemaColumns: schemaTable.columns,
    catalogColumns: catalogTable.columns,
    schemaIndexes: schemaTable.indexes,
    catalogIndexes: catalogTable.indexes,
    catalogConstraints: catalogTable.constraints,
    diff: diff.diff,
  };
}

/** 查询结构操作列表，按照创建时间倒序返回。 */
export async function listTableOperations({
  table,
  tables,
  type,
  status,
  limit = [0, 20],
  withCount,
}: {
  /** 表 key 筛选。 */
  table?: string;
  /** 多表 key 筛选。 */
  tables?: string[];
  /** 操作类型筛选。 */
  type?: TableStructureOpType;
  /** 操作状态筛选。 */
  status?: TableStructureOpStatus;
  /** 分页下标范围 [start, end)，如 [0, 20] 取第 0~19 行、[20, 40] 取第 20~39 行。 */
  limit?: number[];
  /** 是否返回总数。 */
  withCount?: boolean;
}) {
  const where = whereAll(
    table ? eq(schema.table_structure_ops.table_key, table) : undefined,
    tables?.length ? inArray(schema.table_structure_ops.table_key, tables) : undefined,
    type ? eq(schema.table_structure_ops.type, type) : undefined,
    status ? eq(schema.table_structure_ops.status, status) : undefined,
  );

  const getList = async () => {
    return await db
      .select({
        op_id: schema.table_structure_ops.op_id,
        type: schema.table_structure_ops.type,
        status: schema.table_structure_ops.status,
        table_key: schema.table_structure_ops.table_key,
        table_schema: schema.table_structure_ops.table_schema,
        target_table_name: schema.table_structure_ops.target_table_name,
        source_table_name: schema.table_structure_ops.source_table_name,
        warnings: schema.table_structure_ops.warnings,
        blockers: schema.table_structure_ops.blockers,
        backup_table_name: schema.table_structure_ops.backup_table_name,
        error: schema.table_structure_ops.error,
        create_user_id: schema.table_structure_ops.create_user_id,
        create_timestamp: schema.table_structure_ops.create_timestamp,
        expire_timestamp: schema.table_structure_ops.expire_timestamp,
        apply_user_id: schema.table_structure_ops.apply_user_id,
        start_timestamp: schema.table_structure_ops.start_timestamp,
        end_timestamp: schema.table_structure_ops.end_timestamp,
      })
      .from(schema.table_structure_ops)
      .where(where)
      .orderBy(desc(schema.table_structure_ops.create_timestamp))
      .offset(limit[0] ?? 0)
      .limit((limit[1] ?? 20) - (limit[0] ?? 0));
  };

  const getCount = async () => {
    if (!withCount) {
      return 0;
    }
    return await countRows(schema.table_structure_ops, where);
  };

  const [list, count] = await Promise.all([getList(), getCount()]);
  return {
    list,
    count,
  };
}

/** 查询结构操作详情。 */
export async function detailTableOperations(ids: string[]) {
  if (!ids.length) {
    return [];
  }

  return await db
    .select()
    .from(schema.table_structure_ops)
    .where(inArray(schema.table_structure_ops.op_id, ids));
}

/** 返回最近一次操作记录，供表清单直接展示。 */
async function getLatestOperationMap() {
  const result = await db.execute<{
    op_id: string;
    type: TableStructureOpType;
    status: TableStructureOpStatus;
    table_key: string;
    create_timestamp: Date;
    end_timestamp: Date | null;
  }>(sql`
    select distinct on (table_key)
      op_id,
      type,
      status,
      table_key,
      create_timestamp,
      end_timestamp
    from table_structure_ops
    order by table_key, create_timestamp desc
  `);

  const map = new Map<string, TableListItem['latestOperation']>();
  result.rows.forEach(({ table_key, ...row }) => {
    const known = getManagedTableSchemaByKey(table_key);
    if (known) {
      map.set(table_key, row);
    }
  });
  return map;
}
