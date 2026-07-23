import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { generateClientSecret } from './app.create.js';
import { pickObj } from '@repo/utils-node';
import { eq } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/app/update',
  method: 'POST',
  permission: adminPermissionKey('actions.app.update'),
  handler: async ({ body: { id, update }, operator, now }) => {
    if (update === 'refresh-secret') {
      await db
        .update(schemas.apps)
        .set({
          client_secret: generateClientSecret(),
          last_update_user_id: operator,
          last_update_timestamp: now,
        })
        .where(eq(schemas.apps.id, id));
    } else {
      const updateForm = pickObj(update, ['name', 'desc', 'available']);
      if (Object.keys(updateForm).length) {
        await db
          .update(schemas.apps)
          .set({
            ...updateForm,
            last_update_user_id: operator,
            last_update_timestamp: now,
          })
          .where(eq(schemas.apps.id, id));
      }
    }

    return 'ok';
  },
});

export default api;
