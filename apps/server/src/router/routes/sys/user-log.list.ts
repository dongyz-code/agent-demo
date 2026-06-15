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
import { desc, eq } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/user-log/list',
  method: 'POST',
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const where = whereAll(
      searchFilter(form?.search?.trim(), [schema.user_logs.search_key]),
      rangeFilter(schema.user_logs.timestamp, form?.timestamp),
      listFilter(schema.user_logs.user_id, form?.user_id),
      listFilter(schema.user_logs.key, form?.key),
      form?.ip ? eq(schema.user_logs.ip, form.ip) : undefined,
    );

    const getList = async () => {
      const list = await db
        .select({
          id: schema.user_logs.id,
          timestamp: schema.user_logs.timestamp,
          user_id: schema.user_logs.user_id,
          key: schema.user_logs.key,
          ip: schema.user_logs.ip,
          search_key: schema.user_logs.search_key,
        })
        .from(schema.user_logs)
        .where(where)
        .orderBy(desc(schema.user_logs.timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list;
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return countRows(schema.user_logs, where);
    };

    const [list, count] = await Promise.all([getList(), getCount()]);

    return {
      count,
      list,
    };
  },
});

export default api;
