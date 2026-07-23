import { getDocumentDownload } from '@/hooks/documents/document/read.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-download',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) =>
    await getDocumentDownload(
      body.documentId,
      body.documentVersionId,
      __token.user_id,
    ),
});

export default api;
