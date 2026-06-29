import { randomUUID, randomBytes } from 'node:crypto';
import { db, schema, sql } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

import type { SqlInsertData } from '@/database/index.js';

export function generateClientSecret() {
  return randomBytes(32).toString('base64');
}

const { api } = routerHandler({
  url: '/sys/app/create',
  method: 'POST',
  permission: adminPermissionKey('actions.app.create'),
  handler: async ({ body: { name, desc }, operator, now }) => {
    await db.transaction(async (tx) => {
      const [val] = await tx
        .select({ id: sql<number | null>`MAX(${schema.apps.id})` })
        .from(schema.apps);
      const idNext = val.id === null ? 0 : val.id + 1;
      const item: SqlInsertData['apps'] = {
        id: idNext,
        client_id: randomUUID(),
        client_secret: generateClientSecret(),
        name,
        desc,
        available: true,
        create_user_id: operator,
        create_timestamp: now,
        last_update_user_id: operator,
        last_update_timestamp: now,
        last_login_timestamp: null,
      };
      await tx.insert(schema.apps).values(item);
    });

    return 'ok';
  },
});

export default api;
