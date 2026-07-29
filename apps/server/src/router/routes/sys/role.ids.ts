import { buildWhere, db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/role/ids',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.role'),
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const search = form?.search?.trim();
    const [updatedAfter, updatedBefore] = form?.last_update_timestamp ?? [];
    const where = buildWhere((filter) => {
      if (search) {
        filter.push(
          or(
            ilike(schemas.role.name, `%${search}%`),
            ilike(schemas.role.desc, `%${search}%`),
          ),
        );
      }
      if (form?.available !== undefined) {
        filter.push(eq(schemas.role.available, form.available));
      }
      if (updatedAfter) {
        filter.push(gte(schemas.role.last_update_timestamp, updatedAfter));
      }
      if (updatedBefore) {
        filter.push(lte(schemas.role.last_update_timestamp, updatedBefore));
      }
    });

    const getIds = async () => {
      const list = await db
        .select({ role_id: schemas.role.role_id })
        .from(schemas.role)
        .where(where)
        .orderBy(desc(schemas.role.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list.map((x) => x.role_id);
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return db.$count(schemas.role, where);
    };

    const [ids, count] = await Promise.all([getIds(), getCount()]);

    return {
      count,
      ids,
    };
  },
});

export default api;
