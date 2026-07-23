import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-detail',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.dataset'),
  handler: async ({ body }) => {
    const [dataset] = await db
      .select({
        datasetId: schemas.rag_datasets.dataset_id,
        name: schemas.rag_datasets.name,
        description: schemas.rag_datasets.description,
        status: schemas.rag_datasets.status,
        createdAt: schemas.rag_datasets.create_timestamp,
      })
      .from(schemas.rag_datasets)
      .where(eq(schemas.rag_datasets.dataset_id, body.datasetId))
      .limit(1);
    if (!dataset) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    return dataset;
  },
});

export default api;
