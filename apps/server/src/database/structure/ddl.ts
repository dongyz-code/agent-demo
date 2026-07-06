import { createHash } from 'node:crypto';
import { SQL, sql } from 'drizzle-orm';

import {
  defaultDatabaseSchema,
  describeTableTarget,
  getTableDdlTarget,
  validateSqlIdentifier,
} from './descriptor.js';

import type {
  CreateIndexSqlOptions,
  CreateTableSqlOptions,
  CreateTriggerSqlOptions,
  SchemaTrigger,
  SchemaTriggerFunction,
} from './types.js';

/* ------------------------------------------------------------------ */
/* schema / table / index                                              */
/* ------------------------------------------------------------------ */

/** 生成 create schema if not exists 语句，迁移入口会先确保目标 schema 存在。 */
export function createSchemaSql(schemaName = defaultDatabaseSchema) {
  return sql`create schema if not exists ${sql.identifier(schemaName)}`;
}

/** 生成 create table 语句，字段定义取自 describeTableTarget 的统一描述。 */
export function createTableSql({
  table,
  schemaName,
  tableName,
  ifNotExists,
}: CreateTableSqlOptions) {
  const descriptor = describeTableTarget(table, { schemaName, tableName });
  const primaryNames = descriptor.primaryKey;
  const isSinglePrimaryKey = primaryNames.length === 1;

  const columnDefs = descriptor.columns.map((column) => {
    const parts: SQL[] = [
      sql`${sql.identifier(column.name)}`,
      sql.raw(column.sqlType),
    ];
    if (column.notNull) {
      parts.push(sql`not null`);
    }
    if (column.default !== undefined) {
      parts.push(sql`default ${defaultLiteral(column.default)}`);
    }
    if (isSinglePrimaryKey && primaryNames[0] === column.name) {
      parts.push(sql`primary key`);
    }
    return sql.join(parts, sql` `);
  });

  if (primaryNames.length > 1) {
    columnDefs.push(sql`
      primary key (${sql.join(
        primaryNames.map((name) => sql.identifier(name)),
        sql`, `,
      )})
    `);
  }

  return sql`
    create table ${ifNotExists ? sql`if not exists` : sql.empty()}
    ${sql.identifier(descriptor.schemaName)}.${sql.identifier(descriptor.tableName)}
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
  const descriptor = describeTableTarget(table, { schemaName, tableName });
  return descriptor.indexes
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
        on ${sql.identifier(descriptor.schemaName)}.${sql.identifier(descriptor.tableName)}
        using ${sql.raw(index.method)}
        (${sql.join(index.expressions, sql`, `)})
        ${index.where ? sql`where ${index.where}` : sql.empty()}
      `;
    });
}

/* ------------------------------------------------------------------ */
/* trigger function / trigger                                          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 纯工具函数（标识符引用 / 默认值渲染 / dollar quote）                */
/* ------------------------------------------------------------------ */

/** 安全引用单个 SQL 标识符，用于 SQL 摘要展示。 */
export function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/** 安全引用 schema.table，用于 SQL 摘要展示。 */
export function quoteQualified(schemaName: string, tableName: string) {
  return `${quoteIdent(schemaName)}.${quoteIdent(tableName)}`;
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
