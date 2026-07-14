import { and, eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import { getDatasetRow } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-document-remove',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-document-manage'),
  handler: async ({ body, __token }) => {
    await getDatasetRow(body.datasetId);
    await db
      .delete(schema.rag_dataset_documents)
      .where(
        and(
          eq(schema.rag_dataset_documents.dataset_id, body.datasetId),
          eq(schema.rag_dataset_documents.document_id, body.documentId),
        ),
      );
    return 'ok';
  },
});

export default api;
