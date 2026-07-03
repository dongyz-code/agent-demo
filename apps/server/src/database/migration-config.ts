import { databaseSchemaObjects } from './schema/index.js';

import type { DatabaseMigration } from './migration-types.js';

/** 项目自管迁移声明，配置只描述目标动作，执行、加锁和记录由 migrate.ts 统一负责。 */
export const databaseMigrations = [
  {
    id: '0000_current_schema',
    description: '按当前 Drizzle schema 创建基础表、索引和表管理审计表',
    repeatable: true,
    schema: {
      ...databaseSchemaObjects,
      includeIndexes: true,
      ifNotExists: true,
    },
  },
  {
    id: '0001_drop_legacy_ai_tables',
    description: '清理早期已移除的 AI 应用部署表',
    sql: [
      'drop table if exists "ai_app" cascade',
      'drop table if exists "ai_app_version" cascade',
    ],
  },
] satisfies DatabaseMigration[];
