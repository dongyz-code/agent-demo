import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { desc, eq, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/user/ids',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const [updatedAfter, updatedBefore] = form?.last_update_timestamp ?? [];
    const [loginAfter, loginBefore] = form?.last_login_timestamp ?? [];
    const search = form?.search?.trim();
    const where = buildWhere((filter) => {
      if (search) {
        filter.push(
          or(
            ilike(schemas.user.username, `%${search}%`),
            ilike(schemas.user.email, `%${search}%`),
            ilike(schemas.user.nickname, `%${search}%`),
          ),
        );
      }
      if (form?.available !== undefined) {
        filter.push(eq(schemas.user.available, form.available));
      }
      if (updatedAfter) {
        filter.push(gte(schemas.user.last_update_timestamp, updatedAfter));
      }
      if (updatedBefore) {
        filter.push(lte(schemas.user.last_update_timestamp, updatedBefore));
      }
      if (loginAfter) {
        filter.push(gte(schemas.user.last_login_timestamp, loginAfter));
      }
      if (loginBefore) {
        filter.push(lte(schemas.user.last_login_timestamp, loginBefore));
      }
      if (form?.role_id?.length) {
        const roleSubquery = db
          .selectDistinct({ user_id: schemas.user_role.user_id })
          .from(schemas.user_role)
          .where(inArray(schemas.user_role.role_id, form.role_id));
        filter.push(inArray(schemas.user.user_id, roleSubquery));
      }
    });

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
