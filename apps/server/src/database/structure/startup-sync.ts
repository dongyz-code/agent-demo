import { logger } from '@/configs/index.js';
import { sql } from 'drizzle-orm';

import { db } from '../client.js';
import {
  createTableIndexSqls,
  createTableSql,
  createTriggerFunctionSql,
  createTriggerSqls,
} from './ddl.js';
import { describeTableTarget } from './descriptor.js';
import { bootstrappedTableRegistry } from '../tables/index.js';
import { getTableCatalogSnapshot } from './catalog.js';
import { compareTableStructure } from './diff.js';

import type { TableTargetDescriptor } from './types.js';

/** 启动期建表串行化用的 advisory 锁 tag，避免多实例同时补建同一张表的 trigger。 */
const STARTUP_LOCK_TAG = 'deploy-console:startup-schema-sync';

/**
 * 启动期表结构自检：缺失的表自动创建，字段不一致的只打印警告不改库。
 *
 * 只做"补建缺失 + 上报漂移"，对已存在的表不执行任何 DDL（已有表的索引/trigger 增量
 * 由前端 sync 操作处理，列结构变更由 reset 处理）。多实例同时启动时通过 advisory 锁
 * 串行化建表，避免 trigger 抢建。
 */
export async function startupTableStructureSync() {
  logger.info({ event: 'startup.schema_sync.start' }, '启动期表结构自检开始');
  let created = 0;
  let drifted = 0;
  let failed = 0;

  for (const drizzleTable of bootstrappedTableRegistry) {
    const descriptor = describeTableTarget(drizzleTable);
    const catalog = await getTableCatalogSnapshot({
      schemaName: descriptor.schemaName,
      tableName: descriptor.tableName,
    });

    if (!catalog.exists) {
      try {
        await createMissingTable(descriptor);
        created++;
      } catch (error) {
        failed++;
        logger.error(
          {
            event: 'startup.schema_sync.create_failed',
            table: descriptor.tableName,
            err: error,
          },
          `自动建表失败 ${descriptor.tableName}`,
        );
      }
      continue;
    }

    const { diff } = compareTableStructure(descriptor, catalog);
    if (diff.length) {
      drifted++;
      logger.warn(
        {
          event: 'startup.schema_sync.drift',
          table: descriptor.tableName,
          diff: diff.map((item) => item.message),
        },
        `表 ${descriptor.tableName} 与目标态不一致，未自动修改`,
      );
    }
  }

  logger.info(
    { event: 'startup.schema_sync.done', created, drifted, failed },
    '启动期表结构自检完成',
  );
}

/** 在 advisory 锁内创建缺失的表及其索引和 trigger，幂等可重入。 */
async function createMissingTable(descriptor: TableTargetDescriptor) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${STARTUP_LOCK_TAG}))`,
    );
    await tx.execute(
      createTableSql({
        table: descriptor.table,
        schemaName: descriptor.schemaName,
        tableName: descriptor.tableName,
        ifNotExists: true,
      }),
    );
    for (const statement of createTableIndexSqls({
      table: descriptor.table,
      schemaName: descriptor.schemaName,
      tableName: descriptor.tableName,
      ifNotExists: true,
    })) {
      await tx.execute(statement);
    }
    for (const trigger of descriptor.triggers) {
      await tx.execute(createTriggerFunctionSql(trigger.execute));
      for (const statement of createTriggerSqls(trigger, {
        schemaName: descriptor.schemaName,
        tableName: descriptor.tableName,
      })) {
        await tx.execute(statement);
      }
    }
  });
  logger.info(
    { event: 'startup.schema_sync.created', table: descriptor.tableName },
    `自动创建缺失表 ${descriptor.tableName}`,
  );
}
