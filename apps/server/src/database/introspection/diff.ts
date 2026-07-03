import type { TableDiffLevel, TableDiffSummary } from '@repo/types';
import type { TableCatalog } from './catalog.js';

/**
 * diffTable 对 schema 侧的最小结构契约。
 * TableDescriptor（DB 声明态）与 ManagedTableSchema（业务展示态）都结构满足，无需包装或重跑 describeTable。
 */
export type DiffSchemaSide = {
  /** 表名，用于缺失表时的差异描述。 */
  tableName: string;
  /** 字段列表，只读 name/sqlType/notNull/primaryKey 四项。 */
  columns: ReadonlyArray<{
    name: string;
    sqlType: string;
    notNull: boolean;
    primaryKey: boolean;
  }>;
};

/** 计算单表 schema 目标态和数据库实态之间的差异。 */
export function diffTable(
  schema: DiffSchemaSide,
  catalog: TableCatalog,
): { level: TableDiffLevel; diff: TableDiffSummary[] } {
  const diff: TableDiffSummary[] = [];

  if (!catalog.exists) {
    diff.push({
      scope: 'table',
      type: 'missing',
      name: schema.tableName,
      message: '数据库中不存在该表',
    });
    return {
      level: 'missing' as TableDiffLevel,
      diff,
    };
  }

  const schemaColumns = new Map(
    schema.columns.map((column) => [column.name, column]),
  );
  const catalogColumns = new Map(
    catalog.columns.map((column) => [column.name, column]),
  );

  schemaColumns.forEach((column, name) => {
    const catalogColumn = catalogColumns.get(name);
    if (!catalogColumn) {
      diff.push({
        scope: 'column',
        type: 'missing',
        name,
        message: `数据库缺少字段 ${name}`,
      });
      return;
    }

    if (normalizeSqlType(column.sqlType) !== normalizeSqlType(catalogColumn.sqlType)) {
      diff.push({
        scope: 'column',
        type: 'changed',
        name,
        message: `字段 ${name} 类型不一致：schema=${column.sqlType}, database=${catalogColumn.sqlType}`,
      });
    }

    if (column.notNull !== catalogColumn.notNull) {
      diff.push({
        scope: 'column',
        type: 'changed',
        name,
        message: `字段 ${name} 可空性不一致`,
      });
    }

    if (column.primaryKey !== catalogColumn.primaryKey) {
      diff.push({
        scope: 'column',
        type: 'changed',
        name,
        message: `字段 ${name} 主键状态不一致`,
      });
    }
  });

  for (const name of catalogColumns.keys()) {
    if (!schemaColumns.has(name)) {
      diff.push({
        scope: 'column',
        type: 'extra',
        name,
        message: `数据库存在 schema 未注册字段 ${name}`,
      });
    }
  }

  catalog.indexes.forEach((index) => {
    if (index.complex) {
      diff.push({
        scope: 'index',
        type: 'complex',
        name: index.name,
        message: `索引 ${index.name} 属于首版无法自动重建的复杂索引`,
      });
    }
  });

  catalog.constraints.forEach((constraint) => {
    if (constraint.complex) {
      diff.push({
        scope: 'constraint',
        type: 'complex',
        name: constraint.name,
        message: `约束 ${constraint.name} 属于首版无法自动重建的复杂约束`,
      });
    }
  });

  return {
    level: diff.length ? ('different' as TableDiffLevel) : ('synced' as TableDiffLevel),
    diff,
  };
}

/** 标准化 SQL 类型文本，降低 Drizzle 和 catalog 格式差异造成的误报。 */
export function normalizeSqlType(type: string) {
  return type
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^character varying/, 'varchar')
    .replace('timestamp(6)', 'timestamp (6)');
}
