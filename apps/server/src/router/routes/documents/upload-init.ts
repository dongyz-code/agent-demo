import { initializeDocumentUpload } from '@/hooks/documents/upload/init.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-init',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) =>
    await initializeDocumentUpload(body, __token.user_id),
});

export default api;
