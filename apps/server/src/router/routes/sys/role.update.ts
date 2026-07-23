import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { pickObj } from '@repo/utils-node';
import { inArray } from 'drizzle-orm';
import { stringifyRolePermissionPayload } from '@/router/permission.js';
import { adminPermissionKey } from '@repo/shared/permission';

type RoleRow = typeof schemas.role.$inferSelect;

const { api } = routerHandler({
  url: '/sys/role/update',
  method: 'POST',
  permission: adminPermissionKey('actions.role.update'),
  handler: async ({ body: { id, form }, operator, now }) => {
    if (Array.isArray(id) && !id.length) {
      return 'ok';
    }

    const updateForm: Partial<RoleRow> = pickObj(form, [
      'name',
      'desc',
      'available',
    ]);

    if ('permission' in form) {
      updateForm.permission = stringifyRolePermissionPayload(form.permission);
    }

    if (Object.keys(updateForm).length) {
      const ids = Array.isArray(id) ? id : [id];
      await db
        .update(schemas.role)
        .set({
          ...updateForm,
          last_update_user_id: operator,
          last_update_timestamp: now,
        })
        .where(inArray(schemas.role.role_id, ids));
    }

    return 'ok';
  },
});

export default api;
