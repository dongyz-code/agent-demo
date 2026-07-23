import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { searchDocuments } from '@/hooks/documents/document/read.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-document-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.dataset'),
  handler: async ({ body, __token }) => {
    const [dataset] = await db
      .select({ id: schemas.rag_datasets.dataset_id })
      .from(schemas.rag_datasets)
      .where(eq(schemas.rag_datasets.dataset_id, body.datasetId))
      .limit(1);
    if (!dataset) {
      throw new ROOT_ERROR('相关文件不存在');
    }
    return await searchDocuments(
      {
        search: body.search,
        status: body.status,
        datasetId: body.datasetId,
        limit: body.limit,
        withCount: body.withCount,
      },
      __token.user_id,
    );
  },
});

export default api;
