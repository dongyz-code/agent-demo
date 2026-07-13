import { getFilePreview } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-preview',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) => {
    return await getFilePreview(body.fileId, __token.user_id);
  },
});

export default api;
