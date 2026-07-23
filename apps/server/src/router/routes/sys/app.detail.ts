import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/app/detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.app'),
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({
        id: schemas.apps.id,
        client_id: schemas.apps.client_id,
        client_secret: schemas.apps.client_secret,
        name: schemas.apps.name,
        desc: schemas.apps.desc,
        available: schemas.apps.available,
        create_timestamp: schemas.apps.create_timestamp,
        last_update_timestamp: schemas.apps.last_update_timestamp,
        last_login_timestamp: schemas.apps.last_login_timestamp,
        create_user_id: schemas.apps.create_user_id,
        last_update_user_id: schemas.apps.last_update_user_id,
      })
      .from(schemas.apps)
      .where(inArray(schemas.apps.id, ids));

    return list;
  },
});

export default api;
