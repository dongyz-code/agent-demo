import { index, integer, text, uuid } from 'drizzle-orm/pg-core';

import { bytea, timestamptz, varchar255 } from './common-columns.js';
import { pgTable } from '../structure/index.js';

import type {
  TaskBusinessType,
  TaskCategory,
  TaskStatus,
  TaskTriggerMethod,
} from '@repo/types';

export const tasks = pgTable(
  'tasks',
  {
    /** 任务ID */
    task_id: uuid('task_id').primaryKey(),
    /** 任务标识，分类 */
    task_key: varchar255('task_key').notNull(),
    /** 可以为空，默认就是 task_key，也可根据 detail 自行生成 */
    task_name: text('task_name'),
    /** 用于快速检索的 KEY */
    search_key: text('search_key'),
    /** 运行中任务唯一标识，用于避免重复执行同 pending_uuid 任务 */
    pending_uuid: varchar255('pending_uuid'),
    /** 统一任务中心分类。 */
    task_category: varchar255('task_category')
      .$type<TaskCategory>()
      .notNull()
      .default('system'),
    /** 任务关联的业务对象类型。 */
    business_type: varchar255('business_type').$type<TaskBusinessType>(),
    /** 任务关联的业务对象标识。 */
    business_id: varchar255('business_id'),
    /** 当前执行阶段；系统脚本任务允许为空。 */
    current_stage: varchar255('current_stage'),
    /** 整数进度，范围为 0 到 100。 */
    progress: integer('progress').notNull().default(0),
    /** 已处理项目数量。 */
    processed_items: integer('processed_items').notNull().default(0),
    /** 待处理项目总数。 */
    total_items: integer('total_items').notNull().default(0),
    /** 对外稳定错误码。 */
    error_code: varchar255('error_code'),
    /** 面向用户的安全错误摘要。 */
    error_message: text('error_message'),
    /** 参数列表 */
    args: text('args'),
    /** 任务状态：待开始、进行中、完成、失败、删除、主动停止 */
    status: varchar255('status').$type<TaskStatus>().notNull(),
    /** 执行用户或添加任务的用户，自动任务可为空 */
    execution_user_id: uuid('execution_user_id'),
    /** 任务触发方式：手动或自动 */
    trigger_method: varchar255('trigger_method')
      .$type<TaskTriggerMethod>()
      .notNull(),
    /** 添加任务到队列的时间 */
    create_timestamp: timestamptz('create_timestamp').notNull(),
    /** 开始执行任务的时间 */
    start_timestamp: timestamptz('start_timestamp'),
    /** 任务结束的时间 */
    end_timestamp: timestamptz('end_timestamp'),
    /** 任务执行日志，按行写入，gz 压缩 */
    logs: bytea('logs'),
    /** 最近更新时间 */
    last_update_timestamp: timestamptz('last_update_timestamp'),
  },
  (table) => [
    index('tasks_task_key_idx').on(table.task_key),
    index('tasks_pending_uuid_idx').on(table.pending_uuid),
    index('tasks_category_idx').on(table.task_category),
    index('tasks_business_idx').on(table.business_type, table.business_id),
    index('tasks_stage_idx').on(table.current_stage),
    index('tasks_status_idx').on(table.status),
    index('tasks_trigger_method_idx').on(table.trigger_method),
    index('tasks_create_timestamp_idx').on(table.create_timestamp),
  ],
);
