import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { parseStoredAdminPermissions } from '@/router/permission.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/role/detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.role'),
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({
        role_id: schemas.role.role_id,
        name: schemas.role.name,
        desc: schemas.role.desc,
        permission: schemas.role.permission,
        available: schemas.role.available,
        create_timestamp: schemas.role.create_timestamp,
        last_update_timestamp: schemas.role.last_update_timestamp,
        create_user_id: schemas.role.create_user_id,
        last_update_user_id: schemas.role.last_update_user_id,
      })
      .from(schemas.role)
      .where(inArray(schemas.role.role_id, ids));

    return list.map(({ permission, ...rest }) => {
      const parsedPermission = parseStoredAdminPermissions(permission);
      return {
        ...rest,
        permission: parsedPermission.length ? parsedPermission : null,
      };
    });
  },
});

export default api;
