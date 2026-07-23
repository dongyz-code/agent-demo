import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { and, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/app/ids',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.app'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const search = form?.search?.trim();
    const [updatedAfter, updatedBefore] = form?.last_update_timestamp ?? [];
    const [loginAfter, loginBefore] = form?.last_login_timestamp ?? [];
    const where = and(
      search
        ? or(
            ilike(schemas.apps.name, `%${search}%`),
            ilike(schemas.apps.desc, `%${search}%`),
          )
        : undefined,
      form?.available === undefined
        ? undefined
        : eq(schemas.apps.available, form.available),
      updatedAfter
        ? gte(schemas.apps.last_update_timestamp, updatedAfter)
        : undefined,
      updatedBefore
        ? lte(schemas.apps.last_update_timestamp, updatedBefore)
        : undefined,
      loginAfter
        ? gte(schemas.apps.last_login_timestamp, loginAfter)
        : undefined,
      loginBefore
        ? lte(schemas.apps.last_login_timestamp, loginBefore)
        : undefined,
    );

    const getIds = async () => {
      const list = await db
        .select({ id: schemas.apps.id })
        .from(schemas.apps)
        .where(where)
        .orderBy(desc(schemas.apps.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list.map((x) => x.id);
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return db.$count(schemas.apps, where);
    };

    const [ids, count] = await Promise.all([getIds(), getCount()]);

    return {
      count,
      ids,
    };
  },
});

export default api;
