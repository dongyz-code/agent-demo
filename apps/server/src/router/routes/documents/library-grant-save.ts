import { saveLibraryGrants } from '@/hooks/documents/library-grant.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-grant-save',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.library-grant'),
  handler: async ({ body, __token }) => ({
    list: await saveLibraryGrants(
      body.libraryId,
      body.grants,
      __token.user_id,
    ),
  }),
});

export default api;
