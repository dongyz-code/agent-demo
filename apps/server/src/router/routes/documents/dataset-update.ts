import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-update',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-update'),
  handler: async ({ body, __token }) => {
    const [existing] = await db
      .select({ id: schema.rag_datasets.dataset_id })
      .from(schema.rag_datasets)
      .where(eq(schema.rag_datasets.dataset_id, body.datasetId))
      .limit(1);
    if (!existing) {
      throw new ROOT_ERROR(
        '相关文件不存在',
        'RAG_DATASET_NOT_FOUND: 知识库不存在',
      );
    }
    const name = body.update.name?.trim();
    if (body.update.name !== undefined && !name) {
      throw new ROOT_ERROR(
        '非法参数',
        'RAG_DATASET_NAME_REQUIRED: 知识库名称不能为空',
      );
    }
    const [updated] = await db
      .update(schema.rag_datasets)
      .set({
        ...(body.update.name !== undefined ? { name: name! } : {}),
        ...(body.update.description !== undefined
          ? { description: body.update.description?.trim() || null }
          : {}),
        ...(body.update.status !== undefined
          ? { status: body.update.status }
          : {}),
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(eq(schema.rag_datasets.dataset_id, body.datasetId))
      .returning({
        datasetId: schema.rag_datasets.dataset_id,
        name: schema.rag_datasets.name,
        description: schema.rag_datasets.description,
        status: schema.rag_datasets.status,
        createdAt: schema.rag_datasets.create_timestamp,
      });
    if (!updated) {
      throw new ROOT_ERROR(
        '相关文件不存在',
        'RAG_DATASET_NOT_FOUND: 知识库不存在',
      );
    }
    return updated;
  },
});

export default api;
