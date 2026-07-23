import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-disable',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-update'),
  handler: async ({ body, __token }) => {
    const [updated] = await db
      .update(schemas.rag_datasets)
      .set({
        status: 'disabled',
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(eq(schemas.rag_datasets.dataset_id, body.datasetId))
      .returning({
        datasetId: schemas.rag_datasets.dataset_id,
        name: schemas.rag_datasets.name,
        description: schemas.rag_datasets.description,
        status: schemas.rag_datasets.status,
        createdAt: schemas.rag_datasets.create_timestamp,
      });
    if (!updated) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    return updated;
  },
});

export default api;
