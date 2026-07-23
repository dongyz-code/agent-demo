import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/app/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.app.delete'),
  handler: async ({ body: { ids } }) => {
    if (Array.isArray(ids) && !ids.length) {
      return 'ok';
    }

    await db
      .delete(schemas.apps)
      .where(inArray(schemas.apps.id, Array.isArray(ids) ? ids : [ids]));

    return 'ok';
  },
});

export default api;
