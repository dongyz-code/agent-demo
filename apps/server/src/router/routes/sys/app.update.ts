import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { generateClientSecret } from './app.create.js';
import { pickObj } from '@repo/utils-node';
import { eq } from 'drizzle-orm';
import { listAppUpdatePermissionRequirements } from '@/hooks/admin-permission/index.js';

const { api } = routerHandler({
  url: '/sys/app/update',
  method: 'POST',
  permission: ({ body: { update } }) =>
    listAppUpdatePermissionRequirements(update),
  handler: async ({ body: { id, update }, operator, now }) => {
    if (update === 'refresh-secret') {
      await db
        .update(schema.apps)
        .set({
          client_secret: generateClientSecret(),
          last_update_user_id: operator,
          last_update_timestamp: now,
        })
        .where(eq(schema.apps.id, id));
    } else {
      const updateForm = pickObj(update, ['name', 'desc', 'available']);
      if (Object.keys(updateForm).length) {
        await db
          .update(schema.apps)
          .set({
            ...updateForm,
            last_update_user_id: operator,
            last_update_timestamp: now,
          })
          .where(eq(schema.apps.id, id));
      }
    }

    return 'ok';
  },
});

export default api;
