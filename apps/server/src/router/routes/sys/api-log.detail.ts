import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/api-log/detail',
  method: 'POST',
  permission: adminPermissionKey('actions.api-log.detail'),
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({ id: schemas.api_logs.id, detail: schemas.api_logs.detail })
      .from(schemas.api_logs)
      .where(inArray(schemas.api_logs.id, ids));
    return list;
  },
});

export default api;
