import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/role/detail',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({
        role_id: schema.role.role_id,
        name: schema.role.name,
        desc: schema.role.desc,
        permission: schema.role.permission,
        available: schema.role.available,
        create_timestamp: schema.role.create_timestamp,
        last_update_timestamp: schema.role.last_update_timestamp,
        create_user_id: schema.role.create_user_id,
        last_update_user_id: schema.role.last_update_user_id,
      })
      .from(schema.role)
      .where(inArray(schema.role.role_id, ids));

    return list.map(({ permission, ...rest }) => {
      return {
        ...rest,
        permission: permission ? JSON.parse(permission) : null,
      };
    });
  },
});

export default api;
