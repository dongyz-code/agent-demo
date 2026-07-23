import {
  index,
  integer,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, timestamptz, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

import type {
  DocumentProcessingTaskType,
  FileProcessingStage,
  FileProcessingTriggerSource,
  TaskStatus,
} from '@repo/types';

/** 文件处理任务领域扩展；任务状态只保存在通用 tasks 表。 */
export const file_processing_tasks = pgTable(
  'file_processing_tasks',
  {
    /** 对应通用任务主记录。 */
    task_id: uuid('task_id').primaryKey(),
    /** 被处理的通用文件。 */
    file_id: uuid('file_id').notNull(),
    /** 处理过程中创建或复用的逻辑文档。 */
    document_id: uuid('document_id'),
    /** 本次任务处理的文档版本。 */
    document_version_id: uuid('document_version_id'),
    /** 同一扩展表承载的文档处理能力。 */
    task_type: varchar255('task_type')
      .$type<DocumentProcessingTaskType>()
      .notNull()
      .default('rag'),
    /** RAG 接入的目标知识库。 */
    dataset_id: uuid('dataset_id'),
    /** 同一文件从 1 开始递增的执行序号。 */
    execution_no: integer('execution_no').notNull(),
    /** 上传、手动执行、失败重试或成功后再次执行。 */
    trigger_source: varchar255('trigger_source')
      .$type<FileProcessingTriggerSource>()
      .notNull(),
    /** 预处理与 RAG 接入配置组合版本。 */
    processing_config_version: varchar255('processing_config_version').notNull(),
    /** JSON 结果摘要，不保存完整文档内容。 */
    result_summary: text('result_summary'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('file_processing_tasks_file_execution_unique').on(
      table.file_id,
      table.execution_no,
    ),
    index('file_processing_tasks_file_dataset_idx').on(
      table.file_id,
      table.dataset_id,
    ),
    index('file_processing_tasks_document_idx').on(table.document_id),
    index('file_processing_tasks_version_type_idx').on(
      table.document_version_id,
      table.task_type,
    ),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

/** 文件处理任务的阶段尝试记录。 */
export const file_processing_task_stage_runs = pgTable(
  'file_processing_task_stage_runs',
  {
    /** 阶段记录标识。 */
    stage_run_id: uuid('stage_run_id').notNull(),
    /** 所属通用任务。 */
    task_id: uuid('task_id').notNull(),
    /** 当前执行阶段。 */
    stage: varchar255('stage').$type<FileProcessingStage>().notNull(),
    /** 同一任务同一阶段从 1 开始递增的尝试次数。 */
    attempt: integer('attempt').notNull(),
    /** 阶段执行状态。 */
    status: varchar255('status').$type<TaskStatus>().notNull(),
    /** 阶段已处理项目数量。 */
    processed_items: integer('processed_items').notNull().default(0),
    /** 阶段待处理项目总数。 */
    total_items: integer('total_items').notNull().default(0),
    /** JSON checkpoint，只保存可恢复的轻量状态。 */
    checkpoint: text('checkpoint'),
    /** 稳定错误码。 */
    error_code: varchar255('error_code'),
    /** 安全错误摘要。 */
    error_message: text('error_message'),
    /** 阶段开始时间。 */
    start_timestamp: timestamptz('start_timestamp').notNull(),
    /** 阶段结束时间。 */
    end_timestamp: timestamptz('end_timestamp'),
  },
  (table) => [
    primaryKey({ columns: [table.stage_run_id] }),
    uniqueIndex('file_processing_stage_attempt_unique').on(
      table.task_id,
      table.stage,
      table.attempt,
    ),
    index('file_processing_stage_task_idx').on(table.task_id),
    index('file_processing_stage_status_idx').on(table.status),
  ],
);
