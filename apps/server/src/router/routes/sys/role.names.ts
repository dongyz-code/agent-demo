import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/role/names',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.role'),
  handler: async ({ body: { ids, full } }) => {
    if (!full && !ids.length) {
      return [];
    }

    const query = db
      .select({
        role_id: schema.role.role_id,
        name: schema.role.name,
      })
      .from(schema.role);

    const list = full
      ? await query
      : await query.where(inArray(schema.role.role_id, ids));

    return list;
  },
});

export default api;
