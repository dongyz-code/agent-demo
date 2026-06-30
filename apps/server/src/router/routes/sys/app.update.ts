import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { generateClientSecret } from './app.create.js';
import { pickObj } from '@repo/utils-node';
import { eq } from 'drizzle-orm';
import {
  assertUserAdminPermission,
  listAppUpdatePermissionRequirements,
} from '@/hooks/admin-permission/index.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/app/update',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.app'),
  handler: async ({ body: { id, update }, operator, now }) => {
    await assertUserAdminPermission(
      operator,
      listAppUpdatePermissionRequirements(update),
    );

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
