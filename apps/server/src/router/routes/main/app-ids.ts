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
  url: '/main/app-ids',
  method: 'POST',
  handler: async ({ body: { form, limit = [0, 10], withCount } }) => {
    const where = whereAll(
      searchFilter(form?.search?.trim(), [
        schema.ai_app.name,
        schema.ai_app.desc,
      ]),
      listFilter(schema.ai_app.available, form?.available),
      rangeFilter(schema.ai_app.last_update_timestamp, form?.last_update_timestamp),
    );

    const getIds = async () => {
      const list = await db
        .select({ id: schema.ai_app.id })
        .from(schema.ai_app)
        .where(where)
        .orderBy(desc(schema.ai_app.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]);
      return list.map((x) => x.id);
    };
    const getCount = async () => {
      if (!withCount) {
        return 0;
      }
      return countRows(schema.ai_app, where);
    };

    const [ids, count] = await Promise.all([getIds(), getCount()]);

    return {
      count,
      ids,
    };
  },
});

export default api;
