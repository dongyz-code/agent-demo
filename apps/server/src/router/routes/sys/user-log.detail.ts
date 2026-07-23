import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/user-log/detail',
  method: 'POST',
  permission: adminPermissionKey('actions.user-log.detail'),
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({ id: schemas.user_logs.id, detail: schemas.user_logs.detail })
      .from(schemas.user_logs)
      .where(inArray(schemas.user_logs.id, ids));
    return list;
  },
});

export default api;
