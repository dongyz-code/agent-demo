import { index, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { baseCols, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

import type { RagDatasetDocumentStatus, RagDatasetStatus } from '@repo/types';

export const rag_datasets = pgTable(
  'rag_datasets',
  {
    /** 知识库标识。 */
    dataset_id: uuid('dataset_id').primaryKey(),
    /** 知识库名称。 */
    name: varchar255('name').notNull(),
    /** 知识库说明。 */
    description: text('description'),
    /** 知识库状态。 */
    status: varchar255('status').$type<RagDatasetStatus>().notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('rag_datasets_name_unique').on(table.name),
    index('rag_datasets_status_idx').on(table.status),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

export const rag_dataset_documents = pgTable(
  'rag_dataset_documents',
  {
    /** 知识库文档关联标识。 */
    dataset_document_id: uuid('dataset_document_id').primaryKey(),
    /** 所属知识库。 */
    dataset_id: uuid('dataset_id').notNull(),
    /** 通用文档标识。 */
    document_id: uuid('document_id').notNull(),
    /** 当前实际参与知识库检索的文档版本。 */
    active_version_id: uuid('active_version_id'),
    /** 等待或正在进行 RAG 处理的目标版本。 */
    pending_version_id: uuid('pending_version_id'),
    /** 当前关系的 RAG 处理状态。 */
    rag_status: varchar255('rag_status')
      .$type<RagDatasetDocumentStatus>()
      .notNull()
      .default('pending'),
    /** 最近一次 RAG 失败的安全错误摘要。 */
    rag_error: text('rag_error'),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('rag_dataset_documents_unique').on(
      table.dataset_id,
      table.document_id,
    ),
    index('rag_dataset_documents_document_idx').on(table.document_id),
    index('rag_dataset_documents_active_version_idx').on(
      table.active_version_id,
    ),
    index('rag_dataset_documents_pending_version_idx').on(
      table.pending_version_id,
    ),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);
