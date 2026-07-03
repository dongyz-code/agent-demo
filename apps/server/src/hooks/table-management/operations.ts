import { ROOT_ERROR } from '@/configs/index.js';
import {
  createCatalogFingerprint,
  diffTable,
  getTableCatalog,
} from '@/database/introspection/index.js';
import {
  createTableIndexSqls,
  createTableSql,
  createTriggerFunctionSql,
  createTriggerSqls,
  quoteIdent,
  quoteQualified,
} from '@/database/schema/index.js';
import { db, schema, sql } from '@/database/index.js';
import { dayJsformat } from '@repo/utils-node';
import { randomUUID } from 'node:crypto';
import { eq, SQL } from 'drizzle-orm';

import { buildResetColumnSourceMap } from './plan-utils.js';
import { assertManagedTableSchema } from './schema.js';
import { getAuthorizedTableState } from './state.js';

import type {
  TableColumnMapping,
  TableOperationApplyResult,
  TableOperationPlan,
  TableStructureOpStatus,
  TableStructureOpType,
} from '@repo/types';
import type {
  ManagedTableSchema,
  StoredResetPlan,
  StoredTablePlan,
} from './types.js';
import type { TableCatalog } from '@/database/introspection/index.js';

const planExpireMs = 30 * 60 * 1000;

/** 生成按 Drizzle schema 无损重置表结构的计划，并保存到审计表。 */
export async function createResetPlan({
  user_id,
  table,
  columnMappings = [],
}: {
  /** 当前用户 ID。 */
  user_id: string;
  /** schemaTables 中的目标表 key。 */
  table: string;
  /** 字段复制映射。 */
  columnMappings?: TableColumnMapping[];
}): Promise<TableOperationPlan> {
  const { schemaTable, catalogTable } = await getAuthorizedTableState({
    table,
  });
  const op_id = randomUUID();
  const suffix = op_id.replace(/-/g, '').slice(0, 12);
  const temporaryTableName = `__tm_${schemaTable.tableName}_${suffix}_new`;
  const backupTableName = buildBackupTableName({
    tableName: schemaTable.tableName,
    suffix,
    date: new Date(),
  });
  const blockers: string[] = [];
  const warnings = diffTable(schemaTable, catalogTable).diff.map(
    (item) => item.message,
  );

  columnMappings.forEach((item) => {
    validateIdentifier(item.from, '源字段名');
    validateIdentifier(item.to, '目标字段名');
  });

  if (!catalogTable.exists) {
    blockers.push(`源表 ${schemaTable.tableName} 不存在`);
  }

  const [temporaryCatalog, backupCatalog] = await Promise.all([
    getTableCatalog({
      schemaName: schemaTable.schemaName,
      tableName: temporaryTableName,
    }),
    getTableCatalog({
      schemaName: schemaTable.schemaName,
      tableName: backupTableName,
    }),
  ]);
  if (temporaryCatalog.exists) {
    blockers.push(`临时表 ${temporaryTableName} 已存在`);
  }
  if (backupCatalog.exists) {
    blockers.push(`备份表 ${backupTableName} 已存在`);
  }

  catalogTable.indexes.forEach((index) => {
    if (index.complex) {
      blockers.push(`复杂索引 ${index.name} 暂不支持自动重建`);
    }
  });
  schemaTable.indexes.forEach((index) => {
    if (index.complex) {
      blockers.push(`Drizzle schema 复杂索引 ${index.name} 暂不支持自动重建`);
    }
  });
  catalogTable.constraints.forEach((constraint) => {
    if (constraint.complex) {
      blockers.push(`复杂约束 ${constraint.name} 暂不支持自动重建`);
    }
  });

  const columnSourceMap = buildResetColumnSourceMap({
    schemaTable,
    catalogTable,
    columnMappings,
    blockers,
  });
  const sqlPreview = [
    `create table ${quoteQualified(schemaTable.schemaName, temporaryTableName)} (...)`,
    `insert into ${quoteQualified(
      schemaTable.schemaName,
      temporaryTableName,
    )} (...) select ... from ${quoteQualified(
      schemaTable.schemaName,
      schemaTable.tableName,
    )}`,
    `alter table ${quoteQualified(
      schemaTable.schemaName,
      schemaTable.tableName,
    )} rename to ${quoteIdent(backupTableName)}`,
    `alter table ${quoteQualified(
      schemaTable.schemaName,
      temporaryTableName,
    )} rename to ${quoteIdent(schemaTable.tableName)}`,
  ];

  return await saveOperationPlan({
    op_id,
    user_id,
    type: 'reset',
    schemaTable,
    sourceTableName: schemaTable.tableName,
    catalogTable,
    plan: {
      type: 'reset',
      table,
      schemaName: schemaTable.schemaName,
      tableName: schemaTable.tableName,
      sourceTableName: schemaTable.tableName,
      columnSourceMap,
      catalogFingerprint: createCatalogFingerprint(catalogTable),
      temporaryTableName,
      backupTableName,
    },
    sqlPreview,
    warnings,
    blockers,
    backupTableName,
  });
}

/** 执行已保存的 schema 重置计划。 */
export async function applyResetPlan({
  user_id,
  op_id,
  confirm,
}: {
  /** 当前用户 ID。 */
  user_id: string;
  /** 操作记录 ID。 */
  op_id: string;
  /** 二次确认文本。 */
  confirm: string;
}): Promise<TableOperationApplyResult> {
  return await applySavedPlan({
    user_id,
    op_id,
    confirm,
    type: 'reset',
    execute: async ({ plan, schemaTable }) => {
      if (plan.type !== 'reset' || !plan.temporaryTableName || !plan.backupTableName) {
        throw new ROOT_ERROR('非法参数');
      }
      const temporaryTableName = plan.temporaryTableName;
      const backupTableName = plan.backupTableName;

      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${op_id}))`);
        await tx.execute(sql`set local lock_timeout = '5s'`);
        await tx.execute(sql`set local statement_timeout = '120s'`);
        await tx.execute(sql`
          lock table ${sql.identifier(plan.schemaName)}.${sql.identifier(plan.sourceTableName)}
          in access exclusive mode
        `);
        await tx.execute(
          createTableSql({
            table: schemaTable.drizzleTable,
            schemaName: schemaTable.schemaName,
            tableName: temporaryTableName,
          }),
        );
        await copyTableData({
          execute: (statement) => tx.execute(statement),
          schemaTable,
          plan,
          temporaryTableName,
        });
        for (const statement of createTableIndexSqls({
          table: schemaTable.drizzleTable,
          schemaName: schemaTable.schemaName,
          tableName: temporaryTableName,
          indexNamePrefix: temporaryTableName,
          skipComplex: true,
        })) {
          await tx.execute(statement);
        }
        for (const trigger of schemaTable.triggers) {
          for (const statement of createTriggerSqls(trigger, {
            schemaName: schemaTable.schemaName,
            tableName: temporaryTableName,
          })) {
            await tx.execute(statement);
          }
        }
        await tx.execute(sql`
          alter table ${sql.identifier(plan.schemaName)}.${sql.identifier(plan.sourceTableName)}
          rename to ${sql.identifier(backupTableName)}
        `);
        await tx.execute(sql`
          alter table ${sql.identifier(plan.schemaName)}.${sql.identifier(temporaryTableName)}
          rename to ${sql.identifier(plan.tableName)}
        `);
      });
    },
  });
}

/** 生成已有表的索引/trigger 同步计划：幂等补建缺失索引、重建 trigger，不动数据。 */
export async function createSyncPlan({
  user_id,
  table,
}: {
  /** 当前用户 ID。 */
  user_id: string;
  /** schemaTables 中的目标表 key。 */
  table: string;
}): Promise<TableOperationPlan> {
  const { schemaTable, catalogTable } = await getAuthorizedTableState({ table });
  const op_id = randomUUID();
  const blockers: string[] = [];
  const warnings = diffTable(schemaTable, catalogTable).diff.map(
    (item) => item.message,
  );

  if (!catalogTable.exists) {
    blockers.push(`源表 ${schemaTable.tableName} 不存在`);
  }

  const catalogIndexNames = new Set(catalogTable.indexes.map((index) => index.name));
  // 缺失索引 = schema 声明但 DB 没有；complex 的无法自动建，进 blocker。
  const missingIndexes = schemaTable.indexes
    .filter((index) => !catalogIndexNames.has(index.name))
    .filter((index) => {
      if (index.complex) {
        blockers.push(`复杂索引 ${index.name} 暂不支持自动创建`);
        return false;
      }
      return true;
    })
    .map((index) => index.name);

  const sqlPreview = [
    ...missingIndexes.map(
      (name) => `create index if not exists ${name} on ${quoteQualified(schemaTable.schemaName, schemaTable.tableName)}`,
    ),
    ...schemaTable.triggers.map((trigger) => `create or replace function ${trigger.execute.name} ...`),
    ...schemaTable.triggers.map((trigger) => `create trigger ${trigger.name} ...`),
  ];

  return await saveOperationPlan({
    op_id,
    user_id,
    type: 'sync',
    schemaTable,
    sourceTableName: schemaTable.tableName,
    catalogTable,
    plan: {
      type: 'sync',
      table,
      schemaName: schemaTable.schemaName,
      tableName: schemaTable.tableName,
      sourceTableName: schemaTable.tableName,
      catalogFingerprint: createCatalogFingerprint(catalogTable),
      missingIndexes,
    },
    sqlPreview,
    warnings,
    blockers,
    backupTableName: null,
  });
}

/** 执行已保存的 sync 计划：幂等补建索引 + 同步 trigger。 */
export async function applySyncPlan({
  user_id,
  op_id,
  confirm,
}: {
  /** 当前用户 ID。 */
  user_id: string;
  /** 操作记录 ID。 */
  op_id: string;
  /** 二次确认文本。 */
  confirm: string;
}): Promise<TableOperationApplyResult> {
  return await applySavedPlan({
    user_id,
    op_id,
    confirm,
    type: 'sync',
    execute: async ({ plan, schemaTable }) => {
      if (plan.type !== 'sync') {
        throw new ROOT_ERROR('非法参数');
      }
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${op_id}))`,
        );
        // 幂等：已有索引 no-op，缺失的补上；complex 在 plan 阶段已进 blocker。
        for (const statement of createTableIndexSqls({
          table: schemaTable.drizzleTable,
          schemaName: schemaTable.schemaName,
          tableName: schemaTable.tableName,
          ifNotExists: true,
          skipComplex: true,
        })) {
          await tx.execute(statement);
        }
        // trigger：create or replace function + drop/create trigger，幂等同步函数体与绑定。
        for (const trigger of schemaTable.triggers) {
          await tx.execute(createTriggerFunctionSql(trigger.execute));
          for (const statement of createTriggerSqls(trigger, {
            schemaName: schemaTable.schemaName,
            tableName: schemaTable.tableName,
          })) {
            await tx.execute(statement);
          }
        }
      });
    },
  });
}

/** 保存 plan 记录并返回前端展示结构。 */
async function saveOperationPlan({
  op_id = randomUUID(),
  user_id,
  type,
  schemaTable,
  sourceTableName,
  plan,
  sqlPreview,
  warnings,
  blockers,
  backupTableName,
}: {
  /** 指定操作 ID，reset 需要提前生成表名。 */
  op_id?: string;
  /** 当前用户 ID。 */
  user_id: string;
  /** 操作类型。 */
  type: TableStructureOpType;
  /** Drizzle schema 目标结构。 */
  schemaTable: ManagedTableSchema;
  /** 数据库中的源表名。 */
  sourceTableName: string;
  /** 当前数据库实态。 */
  catalogTable: TableCatalog;
  /** 保存到审计表的计划内容。 */
  plan: StoredTablePlan;
  /** SQL 摘要。 */
  sqlPreview: string[];
  /** 风险提示。 */
  warnings: string[];
  /** 阻塞项。 */
  blockers: string[];
  /** 备份表名。 */
  backupTableName?: string | null;
}): Promise<TableOperationPlan> {
  const now = new Date();
  const expire = new Date(now.getTime() + planExpireMs);
  const status: TableStructureOpStatus = blockers.length ? 'blocked' : 'planned';
  await db.insert(schema.table_structure_ops).values({
    op_id,
    type,
    status,
    table_key: schemaTable.table,
    table_schema: schemaTable.schemaName,
    target_table_name: schemaTable.tableName,
    source_table_name: sourceTableName,
    plan: JSON.stringify(plan),
    sql_preview: JSON.stringify(sqlPreview),
    warnings: warnings.length ? JSON.stringify(warnings) : null,
    blockers: blockers.length ? JSON.stringify(blockers) : null,
    backup_table_name: backupTableName ?? null,
    error: null,
    create_user_id: user_id,
    create_timestamp: now,
    expire_timestamp: expire,
    apply_user_id: null,
    start_timestamp: null,
    end_timestamp: null,
  });

  return {
    op_id,
    type,
    status,
    table: schemaTable.table,
    tableName: schemaTable.tableName,
    sqlPreview,
    warnings,
    blockers,
    backupTableName: backupTableName ?? null,
    confirmText: schemaTable.tableName,
    expire_timestamp: expire,
  };
}

/** 通用 apply 流程，负责状态校验、漂移校验、状态更新和失败记录。 */
async function applySavedPlan({
  user_id,
  op_id,
  confirm,
  type,
  execute,
}: {
  /** 当前用户 ID。 */
  user_id: string;
  /** 操作记录 ID。 */
  op_id: string;
  /** 二次确认文本。 */
  confirm: string;
  /** 操作类型。 */
  type: TableStructureOpType;
  /** 实际执行函数。 */
  execute: (opts: {
    /** 保存的计划内容。 */
    plan: StoredTablePlan;
    /** Drizzle schema 目标结构。 */
    schemaTable: ManagedTableSchema;
  }) => Promise<void>;
}): Promise<TableOperationApplyResult> {
  const row = await getOperationForApply({ op_id, type });
  if (confirm !== row.target_table_name) {
    throw new ROOT_ERROR('校验失败');
  }

  if (row.status !== 'planned') {
    throw new ROOT_ERROR('非法参数');
  }
  if (row.expire_timestamp.getTime() < Date.now()) {
    await updateOperationStatus({
      op_id,
      status: 'expired',
      user_id,
      end: true,
    });
    throw new ROOT_ERROR('校验失败');
  }
  if (row.blockers) {
    throw new ROOT_ERROR('校验失败');
  }

  const plan = JSON.parse(row.plan) as StoredTablePlan;
  const schemaTable = assertManagedTableSchema(plan.table);
  const catalogTable = await getTableCatalog({
    schemaName: plan.schemaName,
    tableName: plan.sourceTableName,
  });
  if (createCatalogFingerprint(catalogTable) !== plan.catalogFingerprint) {
    throw new ROOT_ERROR('校验失败');
  }

  await updateOperationStatus({
    op_id,
    status: 'running',
    user_id,
    start: true,
  });

  try {
    await execute({ plan, schemaTable });
    await updateOperationStatus({
      op_id,
      status: 'completed',
      user_id,
      end: true,
    });
    return {
      op_id,
      status: 'completed',
      backupTableName:
        plan.type === 'reset' ? (plan.backupTableName ?? null) : null,
    };
  } catch (error) {
    await db
      .update(schema.table_structure_ops)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        apply_user_id: user_id,
        end_timestamp: new Date(),
      })
      .where(eq(schema.table_structure_ops.op_id, op_id));
    throw error;
  }
}

/** 查询并校验待执行的操作记录。 */
async function getOperationForApply({
  op_id,
  type,
}: {
  /** 操作记录 ID。 */
  op_id: string;
  /** 操作类型。 */
  type: TableStructureOpType;
}) {
  const [row] = await db
    .select()
    .from(schema.table_structure_ops)
    .where(eq(schema.table_structure_ops.op_id, op_id))
    .limit(1);

  if (!row || row.type !== type) {
    throw new ROOT_ERROR('非法参数');
  }
  return row;
}

/** 更新操作记录状态。 */
async function updateOperationStatus({
  op_id,
  status,
  user_id,
  start,
  end,
}: {
  /** 操作记录 ID。 */
  op_id: string;
  /** 新状态。 */
  status: TableStructureOpStatus;
  /** 执行用户 ID。 */
  user_id: string;
  /** 是否写入开始时间。 */
  start?: boolean;
  /** 是否写入结束时间。 */
  end?: boolean;
}) {
  await db
    .update(schema.table_structure_ops)
    .set({
      status,
      apply_user_id: user_id,
      ...(start ? { start_timestamp: new Date() } : {}),
      ...(end ? { end_timestamp: new Date() } : {}),
    })
    .where(eq(schema.table_structure_ops.op_id, op_id));
}

/** 复制源表中可兼容字段的数据到临时新表。 */
async function copyTableData({
  execute,
  schemaTable,
  plan,
  temporaryTableName,
}: {
  /** SQL 执行函数。 */
  execute: (statement: SQL) => Promise<unknown>;
  /** Drizzle schema 目标结构。 */
  schemaTable: ManagedTableSchema;
  /** 保存的 reset 计划。 */
  plan: StoredResetPlan;
  /** 已校验存在的临时表名。 */
  temporaryTableName: string;
}) {
  const targetColumns = schemaTable.columns.filter(
    (column) => plan.columnSourceMap[column.name],
  );
  if (!targetColumns.length) {
    return;
  }

  await execute(sql`
    insert into ${sql.identifier(plan.schemaName)}.${sql.identifier(temporaryTableName)}
      (${sql.join(targetColumns.map((column) => sql.identifier(column.name)), sql`, `)})
    select ${sql.join(
      targetColumns.map((column) =>
        sql.identifier(plan.columnSourceMap[column.name]!),
      ),
      sql`, `,
    )}
    from ${sql.identifier(plan.schemaName)}.${sql.identifier(plan.sourceTableName)}
  `);
}

/** 校验数据库标识符，避免用户输入进入 SQL identifier。 */
function validateIdentifier(value: string, label: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new ROOT_ERROR('非法参数', `${label}格式不合法`);
  }
}

/** 生成以 backup 开头且包含日期的备份表名，控制长度避免 PostgreSQL 截断。 */
function buildBackupTableName({
  tableName,
  suffix,
  date,
}: {
  /** 原正式表名，用于保留可读上下文。 */
  tableName: string;
  /** 操作 ID 派生的短后缀，用于避免同秒重复。 */
  suffix: string;
  /** 生成计划时刻，用于在表名中展示日期。 */
  date: Date;
}) {
  const timestamp = dayJsformat(date, 'YYYYMMDD_HHmmss');
  const prefix = `backup_${timestamp}_`;
  const postfix = `_${suffix}`;
  const maxIdentifierLength = 63;
  const maxTableNameLength = Math.max(
    1,
    maxIdentifierLength - prefix.length - postfix.length,
  );
  const safeTableName =
    tableName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') ||
    'table';

  return `${prefix}${safeTableName.slice(0, maxTableNameLength)}${postfix}`;
}
