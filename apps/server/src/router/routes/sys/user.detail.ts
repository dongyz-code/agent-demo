import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/user/detail',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const [items, userRole] = await Promise.all([
      db
        .select({
          user_id: schema.user.user_id,
          nickname: schema.user.nickname,
          email: schema.user.email,
          available: schema.user.available,
          last_login_timestamp: schema.user.last_login_timestamp,
          create_timestamp: schema.user.create_timestamp,
          last_update_timestamp: schema.user.last_update_timestamp,
          create_user_id: schema.user.create_user_id,
          last_update_user_id: schema.user.last_update_user_id,
          extra: schema.user.extra,
          username: schema.user.username,
        })
        .from(schema.user)
        .where(inArray(schema.user.user_id, ids)),
      db
        .select({
          user_id: schema.user_role.user_id,
          role_id: schema.user_role.role_id,
        })
        .from(schema.user_role)
        .where(inArray(schema.user_role.user_id, ids)),
    ]);

    const userRoleMap = new Map<string, string[]>();
    userRole.forEach(({ user_id, role_id }) => {
      let list = userRoleMap.get(user_id);
      if (!list) {
        list = [];
        userRoleMap.set(user_id, list);
      }
      list.push(role_id);
    });

    const result = items.map((item) => {
      return {
        ...item,
        role_id: userRoleMap.get(item.user_id) ?? [],
      };
    });

    return result;
  },
});

export default api;
