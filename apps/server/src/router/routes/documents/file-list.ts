import { listManagedFiles } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.management'),
  handler: async ({ body, __token }) => {
    return await listManagedFiles(body, __token.user_id);
  },
});

export default api;
