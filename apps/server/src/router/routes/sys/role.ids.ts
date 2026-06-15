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
import { desc } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/role/ids',
  method: 'POST',
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const where = whereAll(
      searchFilter(form?.search?.trim(), [schema.role.name, schema.role.desc]),
      listFilter(schema.role.available, form?.available),
      rangeFilter(schema.role.last_update_timestamp, form?.last_update_timestamp),
    );

    const getIds = async () => {
      const list = await db
        .select({ role_id: schema.role.role_id })
        .from(schema.role)
        .where(where)
        .orderBy(desc(schema.role.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list.map((x) => x.role_id);
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return countRows(schema.role, where);
    };

    const [ids, count] = await Promise.all([getIds(), getCount()]);

    return {
      count,
      ids,
    };
  },
});

export default api;
