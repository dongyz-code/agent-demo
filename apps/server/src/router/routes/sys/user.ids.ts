import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { and, desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/user/ids',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const [updatedAfter, updatedBefore] = form?.last_update_timestamp ?? [];
    const [loginAfter, loginBefore] = form?.last_login_timestamp ?? [];
    const roleSubquery = form?.role_id?.length
      ? db
          .selectDistinct({ user_id: schemas.user_role.user_id })
          .from(schemas.user_role)
          .where(inArray(schemas.user_role.role_id, form.role_id))
      : undefined;
    const search = form?.search?.trim();
    const where = and(
      search
        ? or(
            ilike(schemas.user.username, `%${search}%`),
            ilike(schemas.user.email, `%${search}%`),
            ilike(schemas.user.nickname, `%${search}%`),
          )
        : undefined,
      form?.available === undefined
        ? undefined
        : eq(schemas.user.available, form.available),
      updatedAfter
        ? gte(schemas.user.last_update_timestamp, updatedAfter)
        : undefined,
      updatedBefore
        ? lte(schemas.user.last_update_timestamp, updatedBefore)
        : undefined,
      loginAfter
        ? gte(schemas.user.last_login_timestamp, loginAfter)
        : undefined,
      loginBefore
        ? lte(schemas.user.last_login_timestamp, loginBefore)
        : undefined,
      roleSubquery ? inArray(schemas.user.user_id, roleSubquery) : undefined,
    );

    const getIds = async () => {
      const list = await db
        .select({ user_id: schemas.user.user_id })
        .from(schemas.user)
        .where(where)
        .orderBy(desc(schemas.user.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list.map((x) => x.user_id);
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return db.$count(schemas.user, where);
    };

    const [ids, count] = await Promise.all([getIds(), getCount()]);

    return {
      count,
      ids,
    };
  },
});

export default api;
