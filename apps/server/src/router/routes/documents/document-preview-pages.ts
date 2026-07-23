import { getDocumentPreviewPages } from '@/hooks/documents/preview/pages.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-preview-pages',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) =>
    await getDocumentPreviewPages(body, __token.user_id),
});

export default api;
