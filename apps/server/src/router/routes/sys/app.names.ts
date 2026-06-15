import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/app/names',
  method: 'POST',
  handler: async ({ body: { ids, full } }) => {
    if (!full && !ids.length) {
      return [];
    }
    const query = db
      .select({ id: schema.apps.id, name: schema.apps.name })
      .from(schema.apps);
    const list = full
      ? await query
      : await query.where(inArray(schema.apps.id, ids));

    return list;
  },
});

export default api;
