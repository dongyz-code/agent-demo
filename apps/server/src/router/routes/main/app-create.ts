import { randomUUID } from 'node:crypto';
import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';

import type { SqlInsertData } from '@/database/index.js';

export const domainRegex = /[^\w-]/;
export const domainRegexError = '域名只能包含字母、数字、下划线和短横线';

const { api } = routerHandler({
  url: '/main/app-create',
  method: 'POST',
  handler: async ({ body: { name, desc, domain }, operator, now }) => {
    if (domain.match(domainRegex)) {
      throw new Error(domainRegexError);
    }

    const item: SqlInsertData['ai_app'] = {
      id: randomUUID(),
      name,
      desc,
      domain,
      available: true,
      create_user_id: operator,
      create_timestamp: now,
      last_update_user_id: operator,
      last_update_timestamp: now,
      deploy_hash: null,
    };

    await db.insert(schema.ai_app).values(item);

    return 'ok';
  },
});

export default api;
