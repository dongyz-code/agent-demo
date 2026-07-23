import { changeDocumentDatasets } from '@/hooks/documents/rag/assignment.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-document-update',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-document-manage'),
  handler: async ({ body, __token }) =>
    await changeDocumentDatasets(
      body.documentId,
      body.datasetIds,
      'replace',
      __token.user_id,
    ),
});

export default api;
