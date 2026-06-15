import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/sys/app/remove',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (Array.isArray(ids) && !ids.length) {
      return 'ok';
    }

    await db
      .delete(schema.apps)
      .where(inArray(schema.apps.id, Array.isArray(ids) ? ids : [ids]));

    return 'ok';
  },
});

export default api;
