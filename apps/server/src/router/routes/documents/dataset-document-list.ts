import { asc, eq } from 'drizzle-orm';

import { db, schema } from '@/database/index.js';
import {
  getDatasetRow,
  listDocumentsByIds,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-document-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.dataset'),
  handler: async ({ body, __token }) => {
    await getDatasetRow(body.datasetId);
    const links = await db
      .select({ documentId: schema.rag_dataset_documents.document_id })
      .from(schema.rag_dataset_documents)
      .where(eq(schema.rag_dataset_documents.dataset_id, body.datasetId))
      .orderBy(asc(schema.rag_dataset_documents.create_timestamp));
    const documents = await listDocumentsByIds(
      links.map((link) => link.documentId),
      __token.user_id,
    );
    const search = body.search?.trim().toLocaleLowerCase();
    const filtered = documents.filter(
      (document) =>
        (!search || document.name.toLocaleLowerCase().includes(search)) &&
        (!body.status?.length || body.status.includes(document.status)),
    );
    const [start = 0, end = 20] = body.limit ?? [];
    return {
      list: filtered.slice(start, end),
      count: body.withCount ? filtered.length : 0,
    };
  },
});

export default api;
