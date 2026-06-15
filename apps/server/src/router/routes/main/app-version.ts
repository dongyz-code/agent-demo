import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';

import type { ApiMain } from '@/types/index.js';

type Item = ApiMain.AiAppAction['version']['resp'][number]['list'][number];

const { api } = routerHandler({
  url: '/main/app-version',
  method: 'POST',
  handler: async ({ body: { ids } }) => {
    if (!ids.length) {
      return [];
    }

    const list = await db
      .select()
      .from(schema.ai_app_version)
      .where(inArray(schema.ai_app_version.id, Array.isArray(ids) ? ids : [ids]));

    const map = new Map<string, Item[]>();

    list.forEach(({ id, hash, ...rest }) => {
      let list = map.get(id);

      const cur: Item = {
        hash: hash.toString('hex'),
        ...rest,
      };

      if (!list) {
        list = [cur];
        map.set(id, list);
      } else {
        list.push(cur);
      }
    });

    const result = [...map.entries()].map(([id, list]) => {
      return { id, list };
    });

    map.clear();

    return result;
  },
});

export default api;
