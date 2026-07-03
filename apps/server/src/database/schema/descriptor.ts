import { ROOT } from '@/configs/index.js';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { SQL, sql } from 'drizzle-orm';

import { getTableSchemaObjects } from './declaration.js';

import type {
  ColumnDescriptor,
  DrizzleIndexConfig,
  IndexDescriptor,
  TableDdlTarget,
  TableDescriptor,
} from './types.js';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

/** 数据库连接配置中的默认 PostgreSQL schema，Drizzle 表未声明 schema 时使用它。 */
export const defaultDatabaseSchema = ROOT.pg.path?.trim() || 'public';

/** describeTable 与 DDL emitter 共用的目标覆盖选项。 */
export type DescribeTableOptions = {
  /** PostgreSQL schema 名称；未传时使用表声明或默认 schema。 */
  schemaName?: string;
  /** 真实表名；未传时使用 Drizzle schema 中声明的表名。 */
  tableName?: string;
};

/** 返回 Drizzle 表在 PostgreSQL 中的 schema 和表名。 */
export function getTableDdlTarget({
  table,
  schemaName,
  tableName,
}: TableDdlTarget) {
  const config = getTableConfig(table);
  return {
    schemaName: schemaName ?? config.schema ?? defaultDatabaseSchema,
    tableName: tableName ?? config.name,
  };
}

/**
 * 单一 introspection 入口：一次 getTableConfig 产出表的完整目标态描述。
 *
 * 主键名集合只算一次、列只遍历一次、索引只归一一次、trigger 只取一次，
 * DDL emitter 与表管理 hooks 都消费本结果，不再各自重推。
 *
 * @param table Drizzle 表对象。
 * @param options schema/table 覆盖，用于表管理重建临时表场景。
 */
export function describeTable(
  table: AnyPgTable,
  options: DescribeTableOptions = {},
): TableDescriptor {
  const target = getTableDdlTarget({ table, ...options });
  const config = getTableConfig(table);
  const primaryNameSet = new Set(
    config.primaryKeys.flatMap((item) => item.columns.map((column) => column.name)),
  );

  const columns: ColumnDescriptor[] = config.columns.map((column) => {
    const primaryKey = column.primary || primaryNameSet.has(column.name);
    return {
      name: column.name,
      sqlType: column.getSQLType(),
      dataType: column.dataType,
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: column.default,
      primaryKey,
    };
  });

  // 主键列名按字段声明顺序返回，与旧 createTableSql 的 primaryColumns 行为一致。
  const primaryKey = columns
    .filter((column) => column.primaryKey)
    .map((column) => column.name);

  const indexes = normalizeIndexes({
    table,
    tableName: target.tableName,
  });
  const { triggerFunctions, triggers } = getTableSchemaObjects(table);

  return {
    table,
    schemaName: target.schemaName,
    tableName: target.tableName,
    columns,
    primaryKey,
    indexes,
    triggers,
    triggerFunctions,
  };
}

/** 校验受控配置里的 SQL 标识符片段，避免拼接索引方法等关键字时引入任意 SQL。 */
export function validateSqlIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${label}格式不合法`);
  }
}

/** 将 Drizzle 表索引统一转换为 DDL 和展示都能消费的结构。 */
function normalizeIndexes({
  table,
  tableName,
}: {
  /** Drizzle 表对象。 */
  table: AnyPgTable;
  /** 兜底生成索引名时使用的表名。 */
  tableName: string;
}): IndexDescriptor[] {
  const config = getTableConfig(table);
  return config.indexes.map((item) => {
    const index = item as unknown as { config: DrizzleIndexConfig };
    const method = index.config.method ?? 'btree';
    validateSqlIdentifier(method, '索引方法');
    const columns = index.config.columns.map(normalizeIndexColumn);
    const where =
      index.config.where instanceof SQL ? index.config.where : undefined;
    const complex =
      columns.some((column) => column.complex) ||
      Boolean(index.config.where && !where);
    const columnNames = columns.map((column) => column.name);

    return {
      name: index.config.name ?? `${tableName}_${columnNames.join('_')}_idx`,
      columns: columnNames,
      unique: index.config.unique,
      complex,
      method,
      expressions: columns.map((column) => column.expression),
      where,
    };
  });
}

/** 将 Drizzle index 字段或表达式转换为 SQL 片段和展示名。 */
function normalizeIndexColumn(column: unknown) {
  const columnName = getColumnName(column);
  if (columnName) {
    return {
      name: columnName,
      expression: sql.identifier(columnName),
      complex: false,
    };
  }
  if (column instanceof SQL) {
    return {
      name: '<expression>',
      expression: column,
      complex: false,
    };
  }
  return {
    name: '<expression>',
    expression: sql.empty(),
    complex: true,
  };
}

/** 尝试从 Drizzle column 运行时对象中取出数据库字段名。 */
function getColumnName(value: unknown) {
  if (!value || typeof value !== 'object') {
    return;
  }
  const { name } = value as { name?: unknown };
  return typeof name === 'string' ? name : undefined;
}
