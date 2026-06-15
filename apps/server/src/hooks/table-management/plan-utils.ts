import type { TableColumnMapping } from '@repo/types';
import type { ManagedTableCatalog, ManagedTableSchema } from './types.js';

/** 构造 rename 计划的目标字段到源字段映射。 */
export function buildRenameColumnSourceMap({
  schemaTable,
  catalogTable,
  columnMappings,
  blockers,
}: {
  /** Drizzle schema 目标结构。 */
  schemaTable: ManagedTableSchema;
  /** Postgres catalog 真实结构。 */
  catalogTable: ManagedTableCatalog;
  /** 字段重命名映射。 */
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
  const mappedTargets = new Set<string>();
  const columnSourceMap: Record<string, string> = {};

  columnMappings.forEach(({ from, to }) => {
    if (mappedTargets.has(to)) {
      blockers.push(`字段 ${to} 存在重复映射`);
    }
    mappedTargets.add(to);
    const sourceColumn = catalogColumns.get(from);
    const targetColumn = schemaColumns.get(to);
    if (!sourceColumn) {
      blockers.push(`源字段 ${from} 不存在`);
      return;
    }
    if (!targetColumn) {
      blockers.push(`目标字段 ${to} 不在 Drizzle schema 中`);
      return;
    }
    if (normalizeSqlType(sourceColumn.sqlType) !== normalizeSqlType(targetColumn.sqlType)) {
      blockers.push(`字段 ${from} 与 ${to} 类型不兼容`);
      return;
    }
    columnSourceMap[to] = from;
  });

  schemaTable.columns.forEach((column) => {
    if (!columnSourceMap[column.name] && catalogColumns.has(column.name)) {
      columnSourceMap[column.name] = column.name;
    }
  });

  return columnSourceMap;
}

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

/** 标准化 SQL 类型文本，用于安全兼容性判断。 */
function normalizeSqlType(type: string) {
  return type
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^character varying/, 'varchar')
    .replace('timestamp(6)', 'timestamp (6)');
}
