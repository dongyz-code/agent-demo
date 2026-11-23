import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { getUserGroup } from '@/hooks/groups.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/group/update',
  method: 'POST',
  permission: adminPermissionKey('actions.group.update'),
  handler: async ({ body, __token }) => {
    await getUserGroup(body.userGroupId);
    const name = body.name?.trim();
    if (body.name !== undefined && !name) throw new ROOT_ERROR('非法参数');
    if (name) {
      const [existing] = await db
        .select({ id: schemas.user_group.user_group_id })
        .from(schemas.user_group)
        .where(eq(schemas.user_group.name, name))
        .limit(1);
      if (existing && existing.id !== body.userGroupId) {
        throw new ROOT_ERROR('用户组名称已存在');
      }
    }
    await db
      .update(schemas.user_group)
      .set({
        name,
        description:
          body.description === undefined
            ? undefined
            : body.description?.trim() || null,
        last_update_user_id: __token.user_id,
        last_update_timestamp: new Date(),
      })
      .where(eq(schemas.user_group.user_group_id, body.userGroupId));
    return await getUserGroup(body.userGroupId);
  },
});

export default api;
