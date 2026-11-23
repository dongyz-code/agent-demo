import { randomUUID } from 'node:crypto';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { getLibrary } from '@/hooks/documents/library-query.js';
import { routerHandler } from '@/router/utils.js';
import { eq } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/library-create',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.library-create'),
  handler: async ({ body, __token }) => {
    const name = body.name.trim();
    if (!name) throw new ROOT_ERROR('非法参数');
    if (body.visibility !== 'restricted' && body.visibility !== 'published') {
      throw new ROOT_ERROR('非法参数');
    }
    const [existing] = await db
      .select({ id: schemas.libraries.library_id })
      .from(schemas.libraries)
      .where(eq(schemas.libraries.name, name))
      .limit(1);
    if (existing) throw new ROOT_ERROR('资料库名称已存在');
    const now = new Date();
    const libraryId = randomUUID();
    const userId = __token.user_id;
    await db.transaction(async (tx) => {
      await tx.insert(schemas.libraries).values({
        library_id: libraryId,
        name,
        description: body.description?.trim() || null,
        visibility: body.visibility,
        status: 'active',
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      });
      await tx.insert(schemas.library_grants).values({
        library_grant_id: randomUUID(),
        library_id: libraryId,
        subject_type: 'user',
        subject_id: userId,
        role: 'manager',
        create_user_id: userId,
        create_timestamp: now,
        last_update_user_id: userId,
        last_update_timestamp: now,
      });
    });
    return await getLibrary(libraryId, userId);
  },
});

export default api;
