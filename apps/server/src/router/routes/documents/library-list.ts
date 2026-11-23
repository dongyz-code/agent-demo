import { routerHandler } from '@/router/utils.js';
import { searchLibraries } from '@/hooks/documents/library-query.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.library'),
  handler: async ({ body, __token }) =>
    await searchLibraries(body, __token.user_id),
});

export default api;
