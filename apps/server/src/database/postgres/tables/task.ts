import {
  index,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { timestamptz, varchar255 } from '../declaration/common-columns.js';
import { pgTable } from '../declaration/declaration.js';

import type {
  TaskAttemptStatus,
  TaskLogLevel,
  TaskStatus,
} from '@repo/types';

/** 通用后台任务当前状态与执行策略快照。 */
export const tasks = pgTable(
  'tasks',
  {
    /** UUIDv7 通用任务标识。 */
    task_id: uuid('task_id').primaryKey(),
    /** 稳定任务名称，同时用于同名任务并发分组。 */
    task_name: varchar255('task_name').notNull(),
    /** 面向任务中心展示的业务名称。 */
    display_name: varchar255('display_name').notNull(),
    /** 子进程动态导入的服务端脚本模块 URL。 */
    script: text('script').notNull(),
    /** 可被 JSON 序列化的任务数据。 */
    data: jsonb('data').notNull(),
    /** 当前生命周期状态。 */
    status: varchar255('status').$type<TaskStatus>().notNull(),
    /** 任务脚本报告的当前业务阶段。 */
    current_stage: varchar255('current_stage'),
    /** 整数进度，范围为 0 到 100。 */
    progress: integer('progress').notNull().default(0),
    /** 已处理项目数量。 */
    processed_items: integer('processed_items').notNull().default(0),
    /** 待处理项目总数。 */
    total_items: integer('total_items').notNull().default(0),
    /** 任务脚本成功返回的可序列化结果。 */
    result: jsonb('result'),
    /** 已创建的执行尝试数量。 */
    attempt_count: integer('attempt_count').notNull().default(0),
    /** 首次执行之外允许的最大重试次数。 */
    max_retries: integer('max_retries').notNull().default(0),
    /** 固定重试间隔，单位毫秒。 */
    retry_delay_ms: integer('retry_delay_ms').notNull().default(0),
    /** 单次执行超时，单位毫秒。 */
    timeout_ms: integer('timeout_ms').notNull(),
    /** 单实例同名任务并发上限。 */
    concurrency: integer('concurrency').notNull(),
    /** retrying 状态的下次可领取时间。 */
    next_run_at: timestamptz('next_run_at'),
    /** 当前 attempt 标识，非 running 时为空。 */
    current_attempt_id: uuid('current_attempt_id'),
    /** 当前领取生成的 lease，非 running 时为空。 */
    lease_id: uuid('lease_id'),
    /** 当前 lease 到期时间。 */
    lease_expires_at: timestamptz('lease_expires_at'),
    /** 最终或最近一次执行的稳定错误码。 */
    error_code: varchar255('error_code'),
    /** 最终或最近一次执行的安全错误摘要。 */
    error_message: text('error_message'),
    /** 入队时间。 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
    /** 首次开始执行时间。 */
    start_timestamp: timestamptz('start_timestamp'),
    /** 最终完成时间。 */
    end_timestamp: timestamptz('end_timestamp'),
    /** 最近状态、进度或 heartbeat 更新时间。 */
    last_update_timestamp: timestamptz('last_update_timestamp').notNull(),
  },
  (table) => [
    index('tasks_schedule_idx').on(
      table.status,
      table.next_run_at,
      table.create_timestamp,
    ),
    index('tasks_name_idx').on(table.task_name),
    index('tasks_create_timestamp_idx').on(table.create_timestamp),
    index('tasks_lease_expiry_idx').on(table.status, table.lease_expires_at),
  ],
);

/** 通用任务每次领取形成的不可覆盖执行记录。 */
export const task_attempts = pgTable(
  'task_attempts',
  {
    /** UUIDv7 attempt 标识。 */
    attempt_id: uuid('attempt_id').primaryKey(),
    /** 所属通用任务。 */
    task_id: uuid('task_id').notNull(),
    /** 从 1 开始的执行序号。 */
    attempt: integer('attempt').notNull(),
    /** 当前或最终执行状态。 */
    status: varchar255('status').$type<TaskAttemptStatus>().notNull(),
    /** 本次领取生成的 lease。 */
    lease_id: uuid('lease_id').notNull(),
    /** 领取任务的服务实例。 */
    worker_id: varchar255('worker_id').notNull(),
    /** 任务子进程 PID，启动前允许为空。 */
    process_id: integer('process_id'),
    /** 稳定错误码。 */
    error_code: varchar255('error_code'),
    /** 安全错误摘要。 */
    error_message: text('error_message'),
    /** 本次成功执行返回的可序列化结果。 */
    result: jsonb('result'),
    /** 本次执行开始时间。 */
    start_timestamp: timestamptz('start_timestamp').notNull(),
    /** 本次执行结束时间。 */
    end_timestamp: timestamptz('end_timestamp'),
  },
  (table) => [
    uniqueIndex('task_attempts_task_attempt_unique').on(
      table.task_id,
      table.attempt,
    ),
    index('task_attempts_task_idx').on(table.task_id, table.attempt),
    index('task_attempts_status_idx').on(table.status),
  ],
);

/** 与任务和 attempt 关联的结构化持久日志。 */
export const task_logs = pgTable(
  'task_logs',
  {
    /** UUIDv7 日志标识。 */
    log_id: uuid('log_id').primaryKey(),
    /** 所属通用任务。 */
    task_id: uuid('task_id').notNull(),
    /** 产生日志的 attempt，入队阶段使用 0。 */
    attempt: integer('attempt').notNull().default(0),
    /** debug、info 或 error。 */
    level: varchar255('level').$type<TaskLogLevel>().notNull(),
    /** 已脱敏的日志消息。 */
    message: text('message').notNull(),
    /** 日志产生时间。 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
  },
  (table) => [
    index('task_logs_task_time_idx').on(
      table.task_id,
      table.create_timestamp,
      table.log_id,
    ),
    index('task_logs_task_attempt_idx').on(table.task_id, table.attempt),
  ],
);
