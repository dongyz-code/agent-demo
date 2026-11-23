import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { requireLibraryAccess } from '@/hooks/documents/library-access.js';
import { getLibrary } from '@/hooks/documents/library-query.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-update',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.library-update'),
  handler: async ({ body, __token }) => {
    await requireLibraryAccess(
      body.libraryId,
      __token.user_id,
      'manager',
      'admin',
    );
    const name = body.name?.trim();
    if (body.name !== undefined && !name) throw new ROOT_ERROR('非法参数');
    if (
      body.visibility &&
      body.visibility !== 'restricted' &&
      body.visibility !== 'published'
    ) {
      throw new ROOT_ERROR('非法参数');
    }
    if (name) {
      const [existing] = await db
        .select({ id: schemas.libraries.library_id })
        .from(schemas.libraries)
        .where(eq(schemas.libraries.name, name))
        .limit(1);
      if (existing && existing.id !== body.libraryId) {
        throw new ROOT_ERROR('资料库名称已存在');
      }
    }
    await db
      .update(schemas.libraries)
      .set({
        name,
        description:
          body.description === undefined
            ? undefined
            : body.description?.trim() || null,
        visibility: body.visibility,
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(eq(schemas.libraries.library_id, body.libraryId));
    return await getLibrary(body.libraryId, __token.user_id);
  },
});

export default api;
