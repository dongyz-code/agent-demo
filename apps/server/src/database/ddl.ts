import { createHash } from 'node:crypto';
import { ROOT } from '@/configs/index.js';
import { SQL, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';

import type { TableIndexInfo } from '@repo/types';
import type {
  SchemaTrigger,
  SchemaTriggerFunction,
} from './schema/table.js';
import type { SQLChunk } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';

/** 数据库连接配置中的默认 PostgreSQL schema，Drizzle 表未声明 schema 时使用它。 */
export const defaultDatabaseSchema = ROOT.pg.path?.trim() || 'public';

/** Drizzle 表在 DDL 中的目标位置，可用于正式表、临时表或备份表。 */
export type TableDdlTarget = {
  /** Drizzle 表对象，提供字段、主键、索引等目标结构信息。 */
  table: AnyPgTable;
  /** PostgreSQL schema 名称；未传时使用数据库连接配置中的默认 schema。 */
  schemaName?: string;
  /** 要创建的真实表名；未传时使用 Drizzle schema 中声明的表名。 */
  tableName?: string;
};

/** 生成建表语句时可选的幂等和命名策略。 */
export type CreateTableSqlOptions = TableDdlTarget & {
  /** 是否生成 create table if not exists，用于自管迁移重复执行保护。 */
  ifNotExists?: boolean;
};

/** 生成索引语句时可选的幂等、命名和复杂索引处理策略。 */
export type CreateIndexSqlOptions = TableDdlTarget & {
  /** 是否生成 create index if not exists，用于自管迁移重复执行保护。 */
  ifNotExists?: boolean;
  /** 是否跳过无法从 Drizzle 运行时结构安全还原的复杂索引。 */
  skipComplex?: boolean;
  /** 索引名前缀；表管理重建临时表时用于避开原表索引名冲突。 */
  indexNamePrefix?: string;
};

/** 生成 trigger 语句时可选的目标表覆盖策略，表管理重建临时表会使用。 */
export type CreateTriggerSqlOptions = {
  /** 要挂载 trigger 的 PostgreSQL schema；未传时从 trigger.table 推导。 */
  schemaName?: string;
  /** 要挂载 trigger 的真实表名；未传时从 trigger.table 推导。 */
  tableName?: string;
};

/** Drizzle index 运行时结构的轻量描述，供 DDL 和表管理共用。 */
type DrizzleIndexConfig = {
  /** Drizzle schema 中声明的索引名，缺省时按表名和字段名兜底生成。 */
  name?: string;
  /** 索引字段或表达式列表。 */
  columns: unknown[];
  /** 是否为唯一索引。 */
  unique: boolean;
  /** PostgreSQL 索引方法，Drizzle 缺省时按 btree 处理。 */
  method?: string;
  /** 部分索引条件；只有 SQL template 能被安全还原为 DDL。 */
  where?: unknown;
};

/** 可执行的索引结构，包含展示信息和 DDL 片段。 */
type NormalizedIndex = TableIndexInfo & {
  /** PostgreSQL 索引方法。 */
  method: string;
  /** 参与 create index 的字段或表达式 SQL 片段。 */
  expressions: SQLChunk[];
  /** 部分索引 where 条件。 */
  where?: SQL;
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

/** 生成 create schema if not exists 语句，迁移入口会先确保目标 schema 存在。 */
export function createSchemaSql(schemaName = defaultDatabaseSchema) {
  return sql`create schema if not exists ${sql.identifier(schemaName)}`;
}

/** 生成 create table 语句，字段定义直接取自 Drizzle column 运行时结构。 */
export function createTableSql({
  table,
  schemaName,
  tableName,
  ifNotExists,
}: CreateTableSqlOptions) {
  const target = getTableDdlTarget({ table, schemaName, tableName });
  const config = getTableConfig(table);
  const primaryColumnNames = new Set(
    config.primaryKeys.flatMap((item) =>
      item.columns.map((column) => column.name),
    ),
  );
  const primaryColumns = config.columns.filter(
    (column) => column.primary || primaryColumnNames.has(column.name),
  );
  const columnDefs = config.columns.map((column) => {
    const parts: SQL[] = [
      sql`${sql.identifier(column.name)}`,
      sql.raw(column.getSQLType()),
    ];
    if (column.notNull) {
      parts.push(sql`not null`);
    }
    if (column.default !== undefined) {
      parts.push(sql`default ${defaultLiteral(column.default)}`);
    }
    if (primaryColumns.length === 1 && primaryColumns[0]?.name === column.name) {
      parts.push(sql`primary key`);
    }
    return sql.join(parts, sql` `);
  });

  if (primaryColumns.length > 1) {
    columnDefs.push(sql`
      primary key (${sql.join(
        primaryColumns.map((column) => sql.identifier(column.name)),
        sql`, `,
      )})
    `);
  }

  return sql`
    create table ${ifNotExists ? sql`if not exists` : sql.empty()}
    ${sql.identifier(target.schemaName)}.${sql.identifier(target.tableName)}
    (${sql.join(columnDefs, sql`, `)})
  `;
}

/** 生成某张表的 create index 语句列表，默认遇到复杂索引时报错以避免静默丢失结构。 */
export function createTableIndexSqls({
  table,
  schemaName,
  tableName,
  ifNotExists,
  skipComplex,
  indexNamePrefix,
}: CreateIndexSqlOptions) {
  const target = getTableDdlTarget({ table, schemaName, tableName });
  return getNormalizedIndexes({ table, tableName: target.tableName })
    .filter((index) => {
      if (!index.complex) {
        return true;
      }
      if (skipComplex) {
        return false;
      }
      throw new Error(`复杂索引 ${index.name} 无法自动生成 DDL，请使用 raw SQL 迁移`);
    })
    .map((index) => {
      const indexName = indexNamePrefix
        ? `${indexNamePrefix}_${index.name}`
        : index.name;
      return sql`
        create ${index.unique ? sql`unique` : sql.empty()} index
        ${ifNotExists ? sql`if not exists` : sql.empty()}
        ${sql.identifier(indexName)}
        on ${sql.identifier(target.schemaName)}.${sql.identifier(target.tableName)}
        using ${sql.raw(index.method)}
        (${sql.join(index.expressions, sql`, `)})
        ${index.where ? sql`where ${index.where}` : sql.empty()}
      `;
    });
}

/** 返回 Drizzle schema 中声明的索引摘要，供表管理展示和 diff 使用。 */
export function getDrizzleTableIndexes({
  table,
  tableName,
}: {
  /** Drizzle 表对象。 */
  table: AnyPgTable;
  /** 兜底生成索引名时使用的表名。 */
  tableName: string;
}): TableIndexInfo[] {
  return getNormalizedIndexes({ table, tableName }).map(
    ({ expressions, method, where, ...index }) => index,
  );
}

/** 生成 trigger function 的 create function 语句，函数体通过 dollar quote 内联。 */
export function createTriggerFunctionSql(
  triggerFunction: SchemaTriggerFunction,
) {
  const schemaName = triggerFunction.schemaName ?? defaultDatabaseSchema;
  validateSqlIdentifier(triggerFunction.name, '函数名');
  validateSqlIdentifier(triggerFunction.language ?? 'plpgsql', '函数语言');
  return sql`
    create ${triggerFunction.replace === false ? sql.empty() : sql`or replace`}
    function ${sql.identifier(schemaName)}.${sql.identifier(triggerFunction.name)}
    (${sql.raw((triggerFunction.args ?? []).join(', '))})
    returns ${sql.raw(triggerFunction.returns ?? 'trigger')}
    language ${sql.raw(triggerFunction.language ?? 'plpgsql')}
    as ${sql.raw(dollarQuote(triggerFunction.body))}
  `;
}

/** 生成 trigger 的 drop/create 语句，默认先删除同表同名 trigger 再创建。 */
export function createTriggerSqls(
  trigger: SchemaTrigger,
  options: CreateTriggerSqlOptions = {},
) {
  const target = getTableDdlTarget({
    table: trigger.table,
    schemaName: options.schemaName,
    tableName: options.tableName,
  });
  const functionSchemaName =
    trigger.execute.schemaName ?? defaultDatabaseSchema;
  validateSqlIdentifier(trigger.name, 'trigger 名称');
  validateSqlIdentifier(trigger.execute.name, '函数名');
  const args = (trigger.functionArgs ?? []).map(quoteLiteral).join(', ');
  const statements: SQL[] = [];
  if (trigger.replace !== false) {
    statements.push(sql`
      drop trigger if exists ${sql.identifier(trigger.name)}
      on ${sql.identifier(target.schemaName)}.${sql.identifier(target.tableName)}
    `);
  }
  statements.push(sql`
    create trigger ${sql.identifier(trigger.name)}
    ${sql.raw(trigger.timing)}
    ${sql.raw(trigger.events.join(' or '))}
    on ${sql.identifier(target.schemaName)}.${sql.identifier(target.tableName)}
    for each ${sql.raw(trigger.forEach ?? 'row')}
    ${trigger.when ? sql.raw(`when (${trigger.when})`) : sql.empty()}
    execute function ${sql.identifier(functionSchemaName)}.${sql.identifier(trigger.execute.name)}
    (${sql.raw(args)})
  `);
  return statements;
}

/** 安全引用单个 SQL 标识符，用于 SQL 摘要展示。 */
export function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/** 安全引用 schema.table，用于 SQL 摘要展示。 */
export function quoteQualified(schemaName: string, tableName: string) {
  return `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;
}

/** 将 Drizzle 表索引统一转换为 DDL 和展示都能消费的结构。 */
function getNormalizedIndexes({
  table,
  tableName,
}: {
  /** Drizzle 表对象。 */
  table: AnyPgTable;
  /** 兜底生成索引名时使用的表名。 */
  tableName: string;
}): NormalizedIndex[] {
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

/** 将 drizzle column.default 转为可内联到 DDL 的 SQL 片段。 */
function defaultLiteral(value: unknown): SQL {
  if (value instanceof SQL) {
    return value;
  }
  if (typeof value === 'string') {
    return sql.raw(`'${value.replace(/'/g, "''")}'`);
  }
  if (typeof value === 'boolean') {
    return sql.raw(value ? 'true' : 'false');
  }
  if (typeof value === 'number') {
    return sql.raw(String(value));
  }
  if (value === null) {
    return sql.raw('null');
  }
  return sql.raw(`'${String(value).replace(/'/g, "''")}'`);
}

/** 用稳定 tag 包裹函数体，避免函数体中的单引号破坏 DDL。 */
function dollarQuote(value: string) {
  const tag = `$schema_${createHash('sha1').update(value).digest('hex').slice(0, 12)}$`;
  return `${tag}\n${value}\n${tag}`;
}

/** 引用 trigger 参数字符串，避免参数内容破坏 execute function 调用。 */
function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

/** 校验受控配置里的 SQL 标识符片段，避免拼接索引方法等关键字时引入任意 SQL。 */
function validateSqlIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${label}格式不合法`);
  }
}
