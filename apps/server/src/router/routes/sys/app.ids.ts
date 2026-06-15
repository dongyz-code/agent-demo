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
  url: '/sys/app/ids',
  method: 'POST',
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const where = whereAll(
      searchFilter(form?.search?.trim(), [schema.apps.name, schema.apps.desc]),
      listFilter(schema.apps.available, form?.available),
      rangeFilter(schema.apps.last_update_timestamp, form?.last_update_timestamp),
      rangeFilter(schema.apps.last_login_timestamp, form?.last_login_timestamp),
    );

    const getIds = async () => {
      const list = await db
        .select({ id: schema.apps.id })
        .from(schema.apps)
        .where(where)
        .orderBy(desc(schema.apps.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list.map((x) => x.id);
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return countRows(schema.apps, where);
    };

    const [ids, count] = await Promise.all([getIds(), getCount()]);

    return {
      count,
      ids,
    };
  },
});

export default api;
