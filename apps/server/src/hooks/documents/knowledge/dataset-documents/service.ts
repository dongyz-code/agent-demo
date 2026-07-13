import { randomUUID } from 'node:crypto';
import { and, asc, count, eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import {
  getDocument,
  listDocumentsByIds,
} from '@/hooks/documents/index.js';
import { getDatasetRow } from '../datasets/service.js';
import { createDomainError } from '../../errors.js';

import type { DocumentStatus } from '@repo/types';

/** 将通用文档幂等加入当前租户知识库。 */
export async function addDocumentToDataset(
  datasetId: string,
  documentId: string,
  userId: string,
) {
  const dataset = await getDatasetRow(datasetId);
  if (dataset.status !== 'active') {
    throw createDomainError(
      'RAG_DATASET_DISABLED',
      '停用知识库不能加入文档',
      'conflict',
    );
  }
  const document = await getDocument(documentId, userId);
  const now = new Date();
  await db
    .insert(schema.rag_dataset_documents)
    .values({
      dataset_document_id: randomUUID(),
      dataset_id: datasetId,
      document_id: documentId,
      create_user_id: userId,
      create_timestamp: now,
      last_update_user_id: userId,
      last_update_timestamp: now,
    })
    .onConflictDoNothing({
      target: [
        schema.rag_dataset_documents.dataset_id,
        schema.rag_dataset_documents.document_id,
      ],
    });
  return document;
}

/** 查询知识库关联的通用文档，不直接访问文档内部表。 */
export async function listDatasetDocuments(
  form: {
    /** 知识库标识。 */
    datasetId: string;
    /** 文档名称搜索。 */
    search?: string;
    /** 文档状态筛选。 */
    status?: DocumentStatus[];
    /** 分页范围。 */
    limit?: number[];
    /** 是否返回总数。 */
    withCount?: boolean;
  },
  userId: string,
) {
  await getDatasetRow(form.datasetId);
  const links = await db
    .select({ documentId: schema.rag_dataset_documents.document_id })
    .from(schema.rag_dataset_documents)
    .where(eq(schema.rag_dataset_documents.dataset_id, form.datasetId))
    .orderBy(asc(schema.rag_dataset_documents.create_timestamp));
  const documents = await listDocumentsByIds(
    links.map((link) => link.documentId),
    userId,
  );
  const search = form.search?.trim().toLocaleLowerCase();
  const filtered = documents.filter(
    (document) =>
      (!search || document.name.toLocaleLowerCase().includes(search)) &&
      (!form.status?.length || form.status.includes(document.status)),
  );
  const [start = 0, end = 20] = form.limit ?? [];
  return {
    list: filtered.slice(start, end),
    count: form.withCount ? filtered.length : 0,
  };
}

/** 移除知识库文档关联，不删除通用文档及其处理产物。 */
export async function removeDocumentFromDataset(
  datasetId: string,
  documentId: string,
  userId: string,
) {
  await getDatasetRow(datasetId);
  await db
    .delete(schema.rag_dataset_documents)
    .where(
      and(
        eq(schema.rag_dataset_documents.dataset_id, datasetId),
        eq(schema.rag_dataset_documents.document_id, documentId),
      ),
    );
}

/** 返回知识库引用当前文档的数量，供删除文档前提示业务影响。 */
export async function countDocumentDatasets(
  documentId: string,
  userId: string,
) {
  await getDocument(documentId, userId);
  const [row] = await db
    .select({ value: count() })
    .from(schema.rag_dataset_documents)
    .innerJoin(
      schema.rag_datasets,
      eq(
        schema.rag_datasets.dataset_id,
        schema.rag_dataset_documents.dataset_id,
      ),
    )
    .where(
      and(
        eq(schema.rag_dataset_documents.document_id, documentId),
      ),
    );
  return row?.value ?? 0;
}
