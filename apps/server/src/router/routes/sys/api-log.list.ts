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
  url: '/sys/api-log/list',
  method: 'POST',
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const where = whereAll(
      searchFilter(form?.search?.trim(), [schema.api_logs.search_key]),
      rangeFilter(schema.api_logs.start_timestamp, form?.start_timestamp),
      listFilter(schema.api_logs.user_id, form?.user_id),
      form?.url ? eq(schema.api_logs.url, form.url) : undefined,
      form?.ip ? eq(schema.api_logs.ip, form.ip) : undefined,
      listFilter(schema.api_logs.status, form?.status),
      listFilter(schema.api_logs.mode, form?.mode),
      listFilter(schema.api_logs.client_id, form?.client_id),
      listFilter(schema.api_logs.client_mark, form?.client_mark),
    );

    const getList = async () => {
      const list = await db
        .select({
          id: schema.api_logs.id,
          start_timestamp: schema.api_logs.start_timestamp,
          end_timestamp: schema.api_logs.end_timestamp,
          user_id: schema.api_logs.user_id,
          url: schema.api_logs.url,
          ip: schema.api_logs.ip,
          search_key: schema.api_logs.search_key,
          status: schema.api_logs.status,
          mode: schema.api_logs.mode,
          client_id: schema.api_logs.client_id,
          duration: schema.api_logs.duration,
          client_mark: schema.api_logs.client_mark,
        })
        .from(schema.api_logs)
        .where(where)
        .orderBy(desc(schema.api_logs.start_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list;
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return countRows(schema.api_logs, where);
    };

    const [list, count] = await Promise.all([getList(), getCount()]);

    return {
      count,
      list,
    };
  },
});

export default api;
