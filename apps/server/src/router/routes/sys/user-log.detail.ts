import { db, schema } from '@/database/index.js';
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
      .select({ id: schema.user_logs.id, detail: schema.user_logs.detail })
      .from(schema.user_logs)
      .where(inArray(schema.user_logs.id, ids));
    return list;
  },
});

export default api;
