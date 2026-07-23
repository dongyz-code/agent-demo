import { removeDocument } from '@/hooks/documents/document/remove.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-remove',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.delete'),
  handler: async ({ body, __token }) =>
    await removeDocument(body.documentId, __token.user_id),
});

export default api;
