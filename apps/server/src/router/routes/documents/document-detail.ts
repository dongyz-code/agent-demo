import { getDocumentDetail } from '@/hooks/documents/document/read.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-detail',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) =>
    await getDocumentDetail(body.documentId, __token.user_id),
});

export default api;
