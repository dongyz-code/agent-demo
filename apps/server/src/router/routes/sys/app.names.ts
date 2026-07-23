import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/app/names',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.app'),
  handler: async ({ body: { ids, full } }) => {
    if (!full && !ids.length) {
      return [];
    }
    const query = db
      .select({ id: schemas.apps.id, name: schemas.apps.name })
      .from(schemas.apps);
    const list = full
      ? await query
      : await query.where(inArray(schemas.apps.id, ids));

    return list;
  },
});

export default api;
