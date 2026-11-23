import { ROOT_ERROR } from '@/configs/index.js';
import { requireLibraryAccess } from '@/hooks/documents/library-access.js';
import { searchLibrarySubjects } from '@/hooks/documents/library-grant.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-subject-search',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.library-grant'),
  handler: async ({ body, __token }) => {
    if (body.subjectType !== 'user' && body.subjectType !== 'group') {
      throw new ROOT_ERROR('非法参数');
    }
    await requireLibraryAccess(
      body.libraryId,
      __token.user_id,
      'manager',
      'admin',
    );
    return {
      list: await searchLibrarySubjects(body.subjectType, body.search),
    };
  },
});

export default api;
