import {
  bigint,
  boolean,
  index,
  integer,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { baseCols, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

import type {
  DocumentPreviewStatus,
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
    /** 后续版本默认是否进入已关联知识库。 */
    rag_enabled: boolean('rag_enabled').notNull().default(true),
    /** 文档生命周期状态，不表达预览或 RAG 结果。 */
    status: varchar255('status')
      .$type<DocumentStatus>()
      .notNull()
      .default('active'),
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
    /** 页面预览处理状态。 */
    preview_status: varchar255('preview_status')
      .$type<DocumentPreviewStatus>()
      .notNull()
      .default('pending'),
    /** 当前完整预览页面数量。 */
    preview_page_count: integer('preview_page_count').notNull().default(0),
    /** 最近一次预览失败的安全错误摘要。 */
    preview_error: text('preview_error'),
    /** 当前页面集合使用的转换器组合版本。 */
    preview_converter_version: varchar255('preview_converter_version'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('document_versions_document_version_unique').on(
      table.document_id,
      table.version,
    ),
    uniqueIndex('document_versions_source_file_unique').on(
      table.source_file_id,
    ),
    index('document_versions_preview_status_idx').on(table.preview_status),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const document_preview_pages = pgTable(
  'document_preview_pages',
  {
    /** 页面所属的不可变文档版本。 */
    document_version_id: uuid('document_version_id').notNull(),
    /** 从 1 开始且在版本内连续的页码。 */
    page_number: integer('page_number').notNull(),
    /** 页面图片像素宽度。 */
    width: integer('width').notNull(),
    /** 页面图片像素高度。 */
    height: integer('height').notNull(),
    /** 服务端确认的页面图片 MIME。 */
    content_type: varchar255('content_type').notNull(),
    /** 页面图片字节数。 */
    size: bigint('size', { mode: 'number' }).notNull(),
    /** 私有页面对象所在 Bucket，仅供服务端使用。 */
    bucket: varchar255('bucket').notNull(),
    /** 私有页面对象路径，不得返回普通客户端。 */
    object_key: text('object_key').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.document_version_id, table.page_number] }),
    uniqueIndex('document_preview_pages_object_unique').on(
      table.bucket,
      table.object_key,
    ),
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
