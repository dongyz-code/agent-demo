import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { countRows, db, schema } from '@/database/index.js';
import { getDocument } from '../files/documents.js';

import type { RagDatasetInfo, RagDatasetStatus } from '@repo/types';

/** 查询知识库列表。 */
export async function listRagDatasets(
  form: {
    /** 名称搜索。 */
    search?: string;
    /** 状态筛选。 */
    status?: RagDatasetStatus[];
    /** 分页范围。 */
    limit?: number[];
    /** 是否返回总数。 */
    withCount?: boolean;
  },
  userId: string,
) {
  const [start = 0, end = 20] = form.limit ?? [];
  const where = and(
    form.search?.trim()
      ? ilike(schema.rag_datasets.name, `%${form.search.trim()}%`)
      : undefined,
    form.status?.length
      ? inArray(schema.rag_datasets.status, form.status)
      : undefined,
  );
  const [list, count] = await Promise.all([
    db
      .select()
      .from(schema.rag_datasets)
      .where(where)
      .orderBy(desc(schema.rag_datasets.create_timestamp))
      .offset(start)
      .limit(Math.max(0, end - start)),
    form.withCount ? countRows(schema.rag_datasets, where) : Promise.resolve(0),
  ]);
  return { list: list.map(toDatasetInfo), count };
}

/** 查询单个知识库。 */
export async function getRagDataset(datasetId: string) {
  return toDatasetInfo(await getDatasetRow(datasetId));
}

/** 更新知识库基础信息和启停状态。 */
export async function updateRagDataset(
  datasetId: string,
  update: Partial<Pick<RagDatasetInfo, 'name' | 'description' | 'status'>>,
  userId: string,
) {
  await getDatasetRow(datasetId);
  const nextName = update.name?.trim();
  if (update.name !== undefined && !nextName) {
    throw new ROOT_ERROR(
      '非法参数',
      'RAG_DATASET_NAME_REQUIRED: 知识库名称不能为空',
    );
  }
  const [updated] = await db
    .update(schema.rag_datasets)
    .set({
      ...(update.name !== undefined ? { name: nextName! } : {}),
      ...(update.description !== undefined
        ? { description: update.description?.trim() || null }
        : {}),
      ...(update.status !== undefined ? { status: update.status } : {}),
      last_update_user_id: userId,
      last_update_timestamp: new Date(),
    })
    .where(eq(schema.rag_datasets.dataset_id, datasetId))
    .returning();
  if (!updated) {
    throw new Error('知识库更新失败');
  }
  return toDatasetInfo(updated);
}

/** 查询知识库内部行。 */
export async function getDatasetRow(datasetId: string) {
  const [row] = await db
    .select()
    .from(schema.rag_datasets)
    .where(eq(schema.rag_datasets.dataset_id, datasetId))
    .limit(1);
  if (!row) {
    throw new ROOT_ERROR(
      '相关文件不存在',
      'RAG_DATASET_NOT_FOUND: 知识库不存在',
    );
  }
  return row;
}

/** 将通用文档幂等加入知识库。 */
export async function addDocumentToDataset(
  datasetId: string,
  documentId: string,
  userId: string,
) {
  const dataset = await getDatasetRow(datasetId);
  if (dataset.status !== 'active') {
    throw new ROOT_ERROR(
      '数据异常',
      'RAG_DATASET_DISABLED: 停用知识库不能加入文档',
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

/** 转换为 API 知识库信息。 */
export function toDatasetInfo(
  row: typeof schema.rag_datasets.$inferSelect,
): RagDatasetInfo {
  return {
    datasetId: row.dataset_id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.create_timestamp,
  };
}
