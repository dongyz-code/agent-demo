import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-preview-pages',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) =>
    await documentAction.getPreviewPages(body, __token.user_id),
});

export default api;
