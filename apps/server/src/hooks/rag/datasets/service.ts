import { randomUUID } from 'node:crypto';
import { and, desc, eq, ilike, inArray } from 'drizzle-orm';

import { countRows, db, schema } from '@/database/index.js';
import { createRagError } from '../errors.js';

import type {
  RagDatasetInfo,
  RagDatasetStatus,
} from '@repo/types';
import type { RagActor } from '../types.js';

/** 新建当前租户的 RAG 知识库。 */
export async function createRagDataset(
  input: { name: string; description?: string },
  actor: RagActor,
) {
  const name = input.name.trim();
  if (!name) {
    throw createRagError('RAG_DATASET_NAME_REQUIRED', '知识库名称不能为空');
  }
  const now = new Date();
  const [created] = await db
    .insert(schema.rag_datasets)
    .values({
      dataset_id: randomUUID(),
      tenant_id: actor.tenantId,
      name,
      description: input.description?.trim() || null,
      status: 'active',
      create_user_id: actor.userId,
      create_timestamp: now,
      last_update_user_id: actor.userId,
      last_update_timestamp: now,
    })
    .returning();
  if (!created) {
    throw new Error('知识库创建失败');
  }
  return toDatasetInfo(created);
}

/** 查询当前租户知识库列表。 */
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
  actor: RagActor,
) {
  const [start = 0, end = 20] = form.limit ?? [];
  const where = and(
    eq(schema.rag_datasets.tenant_id, actor.tenantId),
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
    form.withCount
      ? countRows(schema.rag_datasets, where)
      : Promise.resolve(0),
  ]);
  return { list: list.map(toDatasetInfo), count };
}

/** 查询当前租户单个知识库。 */
export async function getRagDataset(datasetId: string, actor: RagActor) {
  const row = await getDatasetRow(datasetId, actor.tenantId);
  return toDatasetInfo(row);
}

/** 更新知识库基础信息和启停状态。 */
export async function updateRagDataset(
  datasetId: string,
  update: Partial<Pick<RagDatasetInfo, 'name' | 'description' | 'status'>>,
  actor: RagActor,
) {
  await getDatasetRow(datasetId, actor.tenantId);
  const nextName = update.name?.trim();
  if (update.name !== undefined && !nextName) {
    throw createRagError('RAG_DATASET_NAME_REQUIRED', '知识库名称不能为空');
  }
  const [updated] = await db
    .update(schema.rag_datasets)
    .set({
      ...(update.name !== undefined ? { name: nextName! } : {}),
      ...(update.description !== undefined
        ? { description: update.description?.trim() || null }
        : {}),
      ...(update.status !== undefined ? { status: update.status } : {}),
      last_update_user_id: actor.userId,
      last_update_timestamp: new Date(),
    })
    .where(eq(schema.rag_datasets.dataset_id, datasetId))
    .returning();
  if (!updated) {
    throw new Error('知识库更新失败');
  }
  return toDatasetInfo(updated);
}

/** 停用当前租户知识库，保留文档和处理产物供后续审计或恢复。 */
export async function disableRagDataset(datasetId: string, actor: RagActor) {
  return await updateRagDataset(datasetId, { status: 'disabled' }, actor);
}

/** 查询租户内知识库内部行。 */
export async function getDatasetRow(datasetId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(schema.rag_datasets)
    .where(
      and(
        eq(schema.rag_datasets.dataset_id, datasetId),
        eq(schema.rag_datasets.tenant_id, tenantId),
      ),
    )
    .limit(1);
  if (!row) {
    throw createRagError('RAG_DATASET_NOT_FOUND', '知识库不存在', 'not-found');
  }
  return row;
}

/** 转换为 API 知识库信息。 */
function toDatasetInfo(
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
