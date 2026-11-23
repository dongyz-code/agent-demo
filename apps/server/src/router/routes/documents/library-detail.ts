import { routerHandler } from '@/router/utils.js';
import { getLibrary } from '@/hooks/documents/library-query.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-detail',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.library'),
  handler: async ({ body, __token }) =>
    await getLibrary(body.libraryId, __token.user_id),
});

export default api;
