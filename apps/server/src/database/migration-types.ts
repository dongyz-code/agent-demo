import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type {
  SchemaTrigger,
  SchemaTriggerFunction,
} from './schema/table.js';

/** 单个数据库迁移的声明，文件中只放配置，执行顺序和落库记录由 runner 统一处理。 */
export type DatabaseMigration = {
  /** 稳定迁移 ID；一旦进入共享环境不能重命名，否则会被视为新迁移。 */
  id: string;
  /** 人可读说明，用于迁移记录和排查执行历史。 */
  description: string;
  /** 是否每次执行迁移命令都重新运行；schema 目标态同步应使用它保持声明即事实。 */
  repeatable?: boolean;
  /** 按 Drizzle schema 创建表和索引的配置，适合初始化当前目标结构。 */
  schema?: SchemaMigrationConfig;
  /** 需要按顺序执行的原始 SQL，每一项必须是一条完整语句。 */
  sql?: string[];
};

/** 从 Drizzle table 对象生成表结构迁移时使用的配置。 */
export type SchemaMigrationConfig = {
  /** 需要由迁移创建的 Drizzle 表对象，包含业务表和内部审计表。 */
  tables: AnyPgTable[];
  /** 是否同时创建 Drizzle schema 中声明的索引。 */
  includeIndexes?: boolean;
  /** 是否对建表和建索引使用 if not exists，便于兼容已有数据库。 */
  ifNotExists?: boolean;
  /** Drizzle schema 中声明的 trigger function 目标态。 */
  triggerFunctions?: SchemaTriggerFunction[];
  /** Drizzle schema 中声明的 trigger 目标态。 */
  triggers?: SchemaTrigger[];
};
