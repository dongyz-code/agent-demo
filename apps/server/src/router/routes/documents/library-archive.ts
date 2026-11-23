import { eq } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import { requireLibraryAccess } from '@/hooks/documents/library-access.js';
import { getLibrary } from '@/hooks/documents/library-query.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-archive',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.library-archive'),
  handler: async ({ body, __token }) => {
    await requireLibraryAccess(
      body.libraryId,
      __token.user_id,
      'manager',
      'admin',
    );
    await db
      .update(schemas.libraries)
      .set({
        status: 'archived',
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(eq(schemas.libraries.library_id, body.libraryId));
    return await getLibrary(body.libraryId, __token.user_id);
  },
});

export default api;
