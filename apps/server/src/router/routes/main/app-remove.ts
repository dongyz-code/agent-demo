import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

const { api } = routerHandler({
  url: '/main/app-remove',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (Array.isArray(ids) && !ids.length) {
      return 'ok';
    }

    await db
      .delete(schema.ai_app)
      .where(inArray(schema.ai_app.id, Array.isArray(ids) ? ids : [ids]));

    return 'ok';
  },
});

export default api;
