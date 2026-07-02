import type { TableColumnMapping } from '@repo/types';
import type { ManagedTableCatalog, ManagedTableSchema } from './types.js';

import { normalizeSqlType } from './diff.js';

/** 构造 reset 计划的目标字段到源字段映射。 */
export function buildResetColumnSourceMap({
  schemaTable,
  catalogTable,
  columnMappings,
  blockers,
}: {
  /** Drizzle schema 目标结构。 */
  schemaTable: ManagedTableSchema;
  /** Postgres catalog 真实结构。 */
  catalogTable: ManagedTableCatalog;
  /** 字段复制映射。 */
  columnMappings: TableColumnMapping[];
  /** 收集阻塞项的数组。 */
  blockers: string[];
}) {
  const catalogColumns = new Map(
    catalogTable.columns.map((column) => [column.name, column]),
  );
  const schemaColumns = new Map(
    schemaTable.columns.map((column) => [column.name, column]),
  );
  const explicit = new Map(columnMappings.map(({ from, to }) => [to, from]));
  const columnSourceMap: Record<string, string> = {};

  schemaTable.columns.forEach((targetColumn) => {
    const sourceName = explicit.get(targetColumn.name) ?? targetColumn.name;
    const sourceColumn = catalogColumns.get(sourceName);
    if (!sourceColumn) {
      if (targetColumn.notNull && !targetColumn.hasDefault) {
        blockers.push(`新字段 ${targetColumn.name} 不允许为空且没有可复制源字段`);
      }
      return;
    }
    if (normalizeSqlType(sourceColumn.sqlType) !== normalizeSqlType(targetColumn.sqlType)) {
      blockers.push(`字段 ${sourceName} 与 ${targetColumn.name} 类型不兼容`);
      return;
    }
    columnSourceMap[targetColumn.name] = sourceName;
  });

  columnMappings.forEach(({ from, to }) => {
    if (!catalogColumns.has(from)) {
      blockers.push(`源字段 ${from} 不存在`);
    }
    if (!schemaColumns.has(to)) {
      blockers.push(`目标字段 ${to} 不在 Drizzle schema 中`);
    }
  });

  return columnSourceMap;
}
