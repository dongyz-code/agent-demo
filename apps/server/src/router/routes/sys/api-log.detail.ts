import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/api-log/detail',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select({ id: schema.api_logs.id, detail: schema.api_logs.detail })
      .from(schema.api_logs)
      .where(inArray(schema.api_logs.id, ids));
    return list;
  },
});

export default api;
