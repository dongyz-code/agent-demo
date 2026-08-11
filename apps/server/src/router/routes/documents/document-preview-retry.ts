import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-preview-retry',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) =>
    await documentAction.retryPreview(body, __token.user_id),
});

export default api;
