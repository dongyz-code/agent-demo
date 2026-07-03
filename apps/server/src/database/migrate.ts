import { createHash } from 'node:crypto';
import { SQL, sql } from 'drizzle-orm';

import { db, pool } from './client.js';
import {
  createSchemaSql,
  createTableIndexSqls,
  createTableSql,
  createTriggerFunctionSql,
  createTriggerSqls,
  defaultDatabaseSchema,
  getTableDdlTarget,
} from './ddl.js';
import { databaseMigrations } from './migration-config.js';

import type { DatabaseMigration } from './migration-types.js';

type AppliedMigrationRow = {
  /** 已执行迁移 ID。 */
  id: string;
  /** 执行时记录的迁移摘要，用于阻止同 ID 迁移被静默改写。 */
  checksum: string;
};

/** 迁移事务对象类型，限定内部 helper 只能在 runMigrations 的事务中执行 SQL。 */
type MigrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 自管迁移记录表名，放在业务 schema 内，避免依赖 drizzle-kit 的元数据目录。 */
const migrationTableName = '__schema_migrations';

/** 执行未落库的自管迁移，并用事务锁保证同一数据库内只有一个实例执行 DDL。 */
export async function runMigrations() {
  await db.transaction(async (tx) => {
    await tx.execute(createSchemaSql(defaultDatabaseSchema));
    await tx.execute(createMigrationTableSql());
    await tx.execute(sql`
      select pg_advisory_xact_lock(hashtext('deploy-console:database-migrations'))
    `);

    const applied = await getAppliedMigrations(tx);
    for (const migration of databaseMigrations) {
      const checksum = createMigrationChecksum(migration);
      const known = applied.get(migration.id);
      if (known === checksum && !migration.repeatable) {
        continue;
      }
      if (known && known !== checksum && !migration.repeatable) {
        throw new Error(`迁移 ${migration.id} 已执行但内容发生变化，请新增迁移`);
      }
      for (const statement of createMigrationStatements(migration)) {
        await tx.execute(statement);
      }
      await saveMigrationRecord(tx, { migration, checksum });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMigrations();
  await pool.end();
}

/** 创建自管迁移记录表，记录每个迁移 ID 的摘要和执行时间。 */
function createMigrationTableSql() {
  return sql`
    create table if not exists ${migrationTable()} (
      id varchar(255) primary key not null,
      checksum varchar(64) not null,
      description text not null,
      executed_at timestamp (6) with time zone not null default now()
    )
  `;
}

/** 查询已经执行过的迁移记录。 */
async function getAppliedMigrations(
  tx: MigrationTransaction,
) {
  const result = await tx.execute<AppliedMigrationRow>(sql`
    select id, checksum
    from ${migrationTable()}
    order by id
  `);
  return new Map(result.rows.map((row) => [row.id, row.checksum]));
}

/** 保存迁移执行记录，repeatable 迁移会刷新摘要和执行时间。 */
async function saveMigrationRecord(
  tx: MigrationTransaction,
  {
    migration,
    checksum,
  }: {
    /** 已完成执行的迁移声明。 */
    migration: DatabaseMigration;
    /** 本次执行时计算出的迁移摘要。 */
    checksum: string;
  },
) {
  await tx.execute(sql`
    insert into ${migrationTable()} (id, checksum, description)
    values (${migration.id}, ${checksum}, ${migration.description})
    on conflict (id) do update set
      checksum = excluded.checksum,
      description = excluded.description,
      executed_at = now()
  `);
}

/** 把迁移声明编译为可顺序执行的 SQL 语句。 */
function createMigrationStatements(migration: DatabaseMigration) {
  const statements: SQL[] = [];
  if (migration.schema) {
    for (const table of migration.schema.tables) {
      statements.push(
        createTableSql({
          table,
          ifNotExists: migration.schema.ifNotExists,
        }),
      );
      if (migration.schema.includeIndexes) {
        statements.push(
          ...createTableIndexSqls({
            table,
            ifNotExists: migration.schema.ifNotExists,
          }),
        );
      }
    }
  }
  statements.push(...(migration.sql ?? []).map((item) => sql.raw(item)));
  statements.push(
    ...(migration.schema?.triggerFunctions ?? []).map(createTriggerFunctionSql),
  );
  for (const trigger of migration.schema?.triggers ?? []) {
    statements.push(...createTriggerSqls(trigger));
  }
  return statements;
}

/** 根据迁移声明生成稳定摘要，用于发现已执行迁移被原地修改的问题。 */
function createMigrationChecksum(migration: DatabaseMigration) {
  return createHash('sha256')
    .update(JSON.stringify(normalizeMigrationForChecksum(migration)))
    .digest('hex');
}

/** 将包含 Drizzle table 对象的迁移声明转换为可序列化结构。 */
function normalizeMigrationForChecksum(migration: DatabaseMigration) {
  return {
    ...migration,
    schema: migration.schema
      ? normalizeSchemaForChecksum(migration.schema)
      : undefined,
  };
}

/**
 * 将 schema 目标态转换为稳定摘要内容，避免 Drizzle table 对象进入 JSON。
 *
 * @param schema 迁移声明中的 schema 配置，包含表、索引开关、trigger function 和 trigger。
 */
function normalizeSchemaForChecksum(
  schema: NonNullable<DatabaseMigration['schema']>,
) {
  return {
    includeIndexes: schema.includeIndexes,
    ifNotExists: schema.ifNotExists,
    tables: schema.tables.map((table) => getTableDdlTarget({ table })),
    triggerFunctions: schema.triggerFunctions ?? [],
    triggers: (schema.triggers ?? []).map((trigger) => ({
      ...trigger,
      table: getTableDdlTarget({ table: trigger.table }),
      execute: trigger.execute,
    })),
  };
}

/** 返回迁移记录表的限定名称。 */
function migrationTable() {
  return sql`${sql.identifier(defaultDatabaseSchema)}.${sql.identifier(migrationTableName)}`;
}
