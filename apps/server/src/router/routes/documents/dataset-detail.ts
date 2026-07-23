import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-detail',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.dataset'),
  handler: async ({ body }) => {
    const [dataset] = await db
      .select({
        datasetId: schema.rag_datasets.dataset_id,
        name: schema.rag_datasets.name,
        description: schema.rag_datasets.description,
        status: schema.rag_datasets.status,
        createdAt: schema.rag_datasets.create_timestamp,
      })
      .from(schema.rag_datasets)
      .where(eq(schema.rag_datasets.dataset_id, body.datasetId))
      .limit(1);
    if (!dataset) {
      throw new ROOT_ERROR(
        '相关文件不存在',
        'RAG_DATASET_NOT_FOUND: 知识库不存在',
      );
    }
    return dataset;
  },
});

export default api;
