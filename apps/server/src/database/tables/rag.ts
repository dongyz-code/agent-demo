import { index, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { baseCols, varchar255 } from './common-columns.js';
import { pgTable, timestampsTrigger } from '../structure/index.js';

import type { RagDatasetStatus } from '@repo/types';

export const rag_datasets = pgTable(
  'rag_datasets',
  {
    /** 知识库标识。 */
    dataset_id: uuid('dataset_id').primaryKey(),
    /** 所属租户。 */
    tenant_id: varchar255('tenant_id').notNull(),
    /** 知识库名称。 */
    name: varchar255('name').notNull(),
    /** 知识库说明。 */
    description: text('description'),
    /** 知识库状态。 */
    status: varchar255('status').$type<RagDatasetStatus>().notNull(),
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('rag_datasets_tenant_name_unique').on(
      table.tenant_id,
      table.name,
    ),
    index('rag_datasets_tenant_status_idx').on(table.tenant_id, table.status),
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
    ...baseCols(),
  },
  (table) => [
    uniqueIndex('rag_dataset_documents_unique').on(
      table.dataset_id,
      table.document_id,
    ),
    index('rag_dataset_documents_document_idx').on(table.document_id),
    ...timestampsTrigger({
      createColumn: 'create_timestamp',
      updateColumn: 'last_update_timestamp',
    }),
  ],
);

