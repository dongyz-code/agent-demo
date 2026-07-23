import { ROOT } from '@/configs/env.js';
import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/user/names',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.user'),
  handler: async ({ body: { ids, full } }) => {
    ids = ids.filter((x) => x !== ROOT.SYS_ADMIN_USER_ID);

    if (!full && !ids.length) {
      return [];
    }

    const query = db
      .select({
        user_id: schemas.user.user_id,
        nickname: schemas.user.nickname,
        email: schemas.user.email,
      })
      .from(schemas.user);

    const list = full
      ? await query
      : await query.where(inArray(schemas.user.user_id, ids));

    return list;
  },
});

export default api;
