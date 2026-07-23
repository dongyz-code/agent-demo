import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/user/detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user'),
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const [items, userRole] = await Promise.all([
      db
        .select({
          user_id: schemas.user.user_id,
          nickname: schemas.user.nickname,
          email: schemas.user.email,
          available: schemas.user.available,
          last_login_timestamp: schemas.user.last_login_timestamp,
          create_timestamp: schemas.user.create_timestamp,
          last_update_timestamp: schemas.user.last_update_timestamp,
          create_user_id: schemas.user.create_user_id,
          last_update_user_id: schemas.user.last_update_user_id,
          extra: schemas.user.extra,
          username: schemas.user.username,
        })
        .from(schemas.user)
        .where(inArray(schemas.user.user_id, ids)),
      db
        .select({
          user_id: schemas.user_role.user_id,
          role_id: schemas.user_role.role_id,
        })
        .from(schemas.user_role)
        .where(inArray(schemas.user_role.user_id, ids)),
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
