import {
  countRows,
  db,
  listFilter,
  rangeFilter,
  schema,
  searchFilter,
  whereAll,
} from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { desc, inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/user/ids',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const roleSubquery = form?.role_id?.length
      ? db
          .selectDistinct({ user_id: schema.user_role.user_id })
          .from(schema.user_role)
          .where(inArray(schema.user_role.role_id, form.role_id))
      : undefined;
    const where = whereAll(
      searchFilter(form?.search?.trim(), [
        schema.user.username,
        schema.user.email,
        schema.user.nickname,
      ]),
      listFilter(schema.user.available, form?.available),
      rangeFilter(schema.user.last_update_timestamp, form?.last_update_timestamp),
      rangeFilter(schema.user.last_login_timestamp, form?.last_login_timestamp),
      roleSubquery ? inArray(schema.user.user_id, roleSubquery) : undefined,
    );

    const getIds = async () => {
      const list = await db
        .select({ user_id: schema.user.user_id })
        .from(schema.user)
        .where(where)
        .orderBy(desc(schema.user.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list.map((x) => x.user_id);
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return countRows(schema.user, where);
    };

    const [ids, count] = await Promise.all([getIds(), getCount()]);

    return {
      count,
      ids,
    };
  },
});

export default api;
