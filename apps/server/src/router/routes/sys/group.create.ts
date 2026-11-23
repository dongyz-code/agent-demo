import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { getUserGroup } from '@/hooks/groups.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/group/create',
  method: 'POST',
  permission: adminPermissionKey('actions.group.create'),
  handler: async ({ body, __token }) => {
    const name = body.name.trim();
    if (!name) throw new ROOT_ERROR('非法参数');
    const [existing] = await db
      .select({ id: schemas.user_group.user_group_id })
      .from(schemas.user_group)
      .where(eq(schemas.user_group.name, name))
      .limit(1);
    if (existing) throw new ROOT_ERROR('用户组名称已存在');
    const now = new Date();
    const userGroupId = randomUUID();
    await db.insert(schemas.user_group).values({
      user_group_id: userGroupId,
      name,
      description: body.description?.trim() || null,
      create_user_id: __token.user_id,
      create_timestamp: now,
      last_update_user_id: __token.user_id,
      last_update_timestamp: now,
    });
    return await getUserGroup(userGroupId);
  },
});

export default api;
