import { boolean, index, jsonb, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { pgTable } from '../declaration/declaration.js';
import { timestamptz, varchar255 } from '../declaration/common-columns.js';

/** 定时计划只保存可编辑配置，执行能力来自代码白名单。 */
export const schedules = pgTable(
  'schedules',
  {
    /** UUIDv7 计划标识；内置计划使用固定标识避免重启重复种子。 */
    id: varchar255('id').primaryKey(),
    /** 运维展示名称。 */
    name: varchar255('name').notNull(),
    /** 注册处理器稳定标识。 */
    handler: varchar255('handler').notNull(),
    /** 经 Croner 校验的表达式。 */
    cron: varchar255('cron').notNull(),
    /** IANA 调度时区。 */
    timezone: varchar255('timezone').notNull(),
    /** 持久化启停意愿。 */
    enabled: boolean('enabled').notNull(),
    /** 经过处理器校验的业务参数。 */
    params: jsonb('params').$type<Record<string, unknown>>().notNull(),
    /** 运维说明。 */
    description: text('description').notNull(),
    /** 调度器原子推进的下次触发时间。 */
    next_run_at: timestamptz('next_run_at'),
    /** 删除后保留占位，避免内置计划重启复活。 */
    deleted: boolean('deleted').notNull().default(false),
    /** 创建时间。 */
    created_at: timestamptz('created_at').notNull(),
    /** 配置或调度最近更新时间。 */
    updated_at: timestamptz('updated_at').notNull(),
  },
  (table) => [
    index('schedules_due_idx').on(
      table.enabled,
      table.deleted,
      table.next_run_at,
    ),
  ],
);

/** 触发台账保留计划名称及人工幂等标识，执行状态从 tasks 读取。 */
export const schedule_runs = pgTable(
  'schedule_runs',
  {
    /** 触发标识。 */
    id: varchar255('id').primaryKey(),
    /** 所属计划，软删除后仍可关联。 */
    schedule_id: varchar255('schedule_id').notNull(),
    /** 当时的计划名称。 */
    schedule_name: varchar255('schedule_name').notNull(),
    /** scheduled 或 manual。 */
    trigger: varchar255('trigger').$type<'scheduled' | 'manual'>().notNull(),
    /** 自动为计划时间的 ISO 字符串，人工为客户端请求标识。 */
    dedupe_key: varchar255('dedupe_key').notNull(),
    /** 计划时间或人工提交时间。 */
    planned_at: timestamptz('planned_at').notNull(),
    /** 关联通用任务，跳过时为空。 */
    task_id: varchar255('task_id'),
    /** 跳过原因，执行错误从 tasks 读取。 */
    message: text('message'),
    /** 实际记录时间。 */
    created_at: timestamptz('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('schedule_runs_dedupe_idx').on(
      table.schedule_id,
      table.trigger,
      table.dedupe_key,
    ),
    index('schedule_runs_plan_time_idx').on(
      table.schedule_id,
      table.planned_at,
    ),
    index('schedule_runs_time_idx').on(table.planned_at),
  ],
);

/** 持久操作审计，不依赖进程日志保留周期。 */
export const monitor_audits = pgTable(
  'monitor_audits',
  {
    /** 审计标识。 */
    id: varchar255('id').primaryKey(),
    /** 操作人，系统自动操作为空。 */
    actor_id: varchar255('actor_id'),
    /** 操作名称。 */
    action: varchar255('action').notNull(),
    /** 目标计划或缓存空间/键，不保存缓存值与凭据。 */
    target: text('target').notNull(),
    /** 发生时间。 */
    created_at: timestamptz('created_at').notNull(),
  },
  (table) => [index('monitor_audits_time_idx').on(table.created_at)],
);
