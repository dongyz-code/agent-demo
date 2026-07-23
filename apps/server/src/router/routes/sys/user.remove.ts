import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/user/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.user.delete'),
  handler: async ({ body: { ids } }) => {
    if (Array.isArray(ids) && !ids.length) {
      return 'ok';
    }

    const userIds = Array.isArray(ids) ? ids : [ids];
    await db.transaction(async (tx) => {
      await tx.delete(schemas.user).where(inArray(schemas.user.user_id, userIds));
      await tx
        .delete(schemas.user_role)
        .where(inArray(schemas.user_role.user_id, userIds));
    });

    return 'ok';
  },
});

export default api;
