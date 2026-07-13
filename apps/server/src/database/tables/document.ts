import {
  index,
  integer,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, timestamptz, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

import type {
  DocumentBlockType,
  DocumentProcessingStage,
  DocumentProcessingStatus,
  DocumentStatus,
} from '@repo/types';

export const documents = pgTable(
  'documents',
  {
    /** 逻辑文档标识。 */
    document_id: uuid('document_id').primaryKey(),
    /** 文档显示名称。 */
    name: text('name').notNull(),
    /** 当前生效文档版本。 */
    active_version_id: uuid('active_version_id'),
    /** 逻辑文档状态。 */
    status: varchar255('status').$type<DocumentStatus>().notNull(),
    ...baseCols(),
  },
  (table) => [
    index('documents_status_idx').on(table.status),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const document_versions = pgTable(
  'document_versions',
  {
    /** 文档版本标识。 */
    document_version_id: uuid('document_version_id').primaryKey(),
    /** 所属逻辑文档。 */
    document_id: uuid('document_id').notNull(),
    /** 递增业务版本号。 */
    version: integer('version').notNull(),
    /** 通用上传模块中的源文件标识。 */
    source_file_id: uuid('source_file_id').notNull(),
    /** 当前处理状态。 */
    status: varchar255('status').$type<DocumentStatus>().notNull(),
    /** 解析器版本。 */
    parser_version: varchar255('parser_version').notNull(),
    /** 标准化器版本。 */
    normalizer_version: varchar255('normalizer_version').notNull(),
    /** Segment 配置版本。 */
    segment_profile_version: varchar255('segment_profile_version').notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('document_versions_document_version_unique').on(
      table.document_id,
      table.version,
    ),
    index('document_versions_source_file_idx').on(table.source_file_id),
    index('document_versions_status_idx').on(table.status),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const document_processing_jobs = pgTable(
  'document_processing_jobs',
  {
    /** 文档处理任务标识。 */
    job_id: uuid('job_id').primaryKey(),
    /** 所属文档版本。 */
    document_version_id: uuid('document_version_id').notNull(),
    /** 当前执行阶段。 */
    stage: varchar255('stage').$type<DocumentProcessingStage>().notNull(),
    /** 任务状态。 */
    status: varchar255('status').$type<DocumentProcessingStatus>().notNull(),
    /** 处理配置组合版本，用于任务幂等。 */
    config_version: varchar255('config_version').notNull(),
    /** 已处理项目数量。 */
    processed_items: integer('processed_items').notNull().default(0),
    /** 当前阶段总项目数量。 */
    total_items: integer('total_items').notNull().default(0),
    /** JSON checkpoint；只保存可恢复的轻量状态。 */
    checkpoint: text('checkpoint'),
    /** 稳定错误码。 */
    error_code: varchar255('error_code'),
    /** 错误摘要。 */
    error_message: text('error_message'),
    /** 开始执行时间。 */
    start_timestamp: timestamptz('start_timestamp'),
    /** 结束执行时间。 */
    end_timestamp: timestamptz('end_timestamp'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('document_processing_jobs_version_config_unique').on(
      table.document_version_id,
      table.config_version,
    ),
    index('document_processing_jobs_status_stage_idx').on(
      table.status,
      table.stage,
    ),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const document_processing_stage_runs = pgTable(
  'document_processing_stage_runs',
  {
    /** 阶段执行记录标识。 */
    stage_run_id: uuid('stage_run_id').primaryKey(),
    /** 所属文档处理任务。 */
    job_id: uuid('job_id').notNull(),
    /** 执行阶段。 */
    stage: varchar255('stage').$type<DocumentProcessingStage>().notNull(),
    /** 同一阶段的执行次数。 */
    attempt: integer('attempt').notNull(),
    /** 阶段状态。 */
    status: varchar255('status').$type<DocumentProcessingStatus>().notNull(),
    /** 阶段处理数量。 */
    processed_items: integer('processed_items').notNull().default(0),
    /** 稳定错误码。 */
    error_code: varchar255('error_code'),
    /** 阶段错误摘要。 */
    error_message: text('error_message'),
    /** 阶段开始时间。 */
    start_timestamp: timestamptz('start_timestamp').notNull(),
    /** 阶段结束时间。 */
    end_timestamp: timestamptz('end_timestamp'),
  },
  (table) => [
    uniqueIndex('document_processing_stage_runs_attempt_unique').on(
      table.job_id,
      table.stage,
      table.attempt,
    ),
    index('document_processing_stage_runs_job_idx').on(table.job_id),
  ],
);

export const document_parsed_blocks = pgTable(
  'document_parsed_blocks',
  {
    /** 稳定解析块标识。 */
    block_id: uuid('block_id').primaryKey(),
    /** 所属文档版本。 */
    document_version_id: uuid('document_version_id').notNull(),
    /** 块内容类型。 */
    type: varchar255('type').$type<DocumentBlockType>().notNull(),
    /** 解析文本。 */
    content: text('content').notNull(),
    /** JSON 标题路径。 */
    heading_path: text('heading_path').notNull(),
    /** 来源页码。 */
    page: integer('page'),
    /** 文档内顺序。 */
    position: integer('position').notNull(),
    /** JSON 类型专属元数据。 */
    metadata: text('metadata').notNull(),
    /** 解析器版本。 */
    parser_version: varchar255('parser_version').notNull(),
  },
  (table) => [
    uniqueIndex('document_parsed_blocks_version_position_unique').on(
      table.document_version_id,
      table.parser_version,
      table.position,
    ),
    index('document_parsed_blocks_version_idx').on(table.document_version_id),
  ],
);

export const document_segments = pgTable(
  'document_segments',
  {
    /** 确定性 Segment 标识。 */
    segment_id: uuid('segment_id').primaryKey(),
    /** 所属文档版本。 */
    document_version_id: uuid('document_version_id').notNull(),
    /** 父级 Segment 标识。 */
    parent_segment_id: uuid('parent_segment_id'),
    /** Segment 正文。 */
    content: text('content').notNull(),
    /** 用于 Embedding 的结构化文本。 */
    embedding_content: text('embedding_content').notNull(),
    /** 内容 SHA-256。 */
    content_hash: varchar255('content_hash').notNull(),
    /** JSON 标题路径。 */
    heading_path: text('heading_path').notNull(),
    /** 来源页码。 */
    page: integer('page'),
    /** 文档内顺序。 */
    position: integer('position').notNull(),
    /** 估算 token 数。 */
    token_count: integer('token_count').notNull(),
    /** Segment 配置版本。 */
    segment_profile_version: varchar255('segment_profile_version').notNull(),
  },
  (table) => [
    uniqueIndex('document_segments_version_profile_position_unique').on(
      table.document_version_id,
      table.segment_profile_version,
      table.position,
    ),
    index('document_segments_version_idx').on(table.document_version_id),
    index('document_segments_content_hash_idx').on(table.content_hash),
  ],
);
