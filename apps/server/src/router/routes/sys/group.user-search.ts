import { or, ilike } from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/group/user-search',
  method: 'POST',
  permission: adminPermissionKey('actions.group.member'),
  handler: async ({ body }) => {
    const keyword = body.search?.trim();
    const list = await db
      .select({
        userId: schemas.user.user_id,
        nickname: schemas.user.nickname,
        username: schemas.user.username,
      })
      .from(schemas.user)
      .where(
        keyword
          ? or(
              ilike(schemas.user.nickname, `%${keyword}%`),
              ilike(schemas.user.username, `%${keyword}%`),
            )
          : undefined,
      )
      .limit(20);
    return { list };
  },
});

export default api;
