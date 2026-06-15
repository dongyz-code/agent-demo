import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/app/detail',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({
        id: schema.apps.id,
        client_id: schema.apps.client_id,
        client_secret: schema.apps.client_secret,
        name: schema.apps.name,
        desc: schema.apps.desc,
        available: schema.apps.available,
        create_timestamp: schema.apps.create_timestamp,
        last_update_timestamp: schema.apps.last_update_timestamp,
        last_login_timestamp: schema.apps.last_login_timestamp,
        create_user_id: schema.apps.create_user_id,
        last_update_user_id: schema.apps.last_update_user_id,
      })
      .from(schema.apps)
      .where(inArray(schema.apps.id, ids));

    return list;
  },
});

export default api;
