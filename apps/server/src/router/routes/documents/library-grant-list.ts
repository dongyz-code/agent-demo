import { requireLibraryAccess } from '@/hooks/documents/library-access.js';
import { listLibraryGrants } from '@/hooks/documents/library-grant.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-grant-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.library'),
  handler: async ({ body, __token }) => {
    await requireLibraryAccess(
      body.libraryId,
      __token.user_id,
      'user',
      'admin',
    );
    return { list: await listLibraryGrants(body.libraryId) };
  },
});

export default api;
