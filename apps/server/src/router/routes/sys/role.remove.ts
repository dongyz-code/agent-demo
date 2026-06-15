import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/role/remove',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (Array.isArray(ids) && !ids.length) {
      return 'ok';
    }

    const roleIds = Array.isArray(ids) ? ids : [ids];
    await db.transaction(async (tx) => {
      await tx.delete(schema.role).where(inArray(schema.role.role_id, roleIds));
      await tx
        .delete(schema.user_role)
        .where(inArray(schema.user_role.role_id, roleIds));
    });

    return 'ok';
  },
});

export default api;
