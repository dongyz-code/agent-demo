import { addDocumentToDataset } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-document-add',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-document-manage'),
  handler: async ({ body, __token }) => {
    return await addDocumentToDataset(
      body.datasetId,
      body.documentId,
      __token.user_id,
    );
  },
});

export default api;
