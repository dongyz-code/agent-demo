import { routerHandler } from '@/router/utils.js';
import { randomUUID } from 'node:crypto';
import { db, schemas } from '@/database/index.js';
import { ROOT_ERROR } from '@/configs/error.js';
import { inArray } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';

import type { ApiSys } from '@/types/index.js';

type UserItem = typeof schemas.user.$inferInsert;
type UserRoleItem = typeof schemas.user_role.$inferInsert;

export async function createUser({
  list,
  operator,
  now,
  ignoreExist = false,
}: {
  list: ApiSys.UserAction['create']['req']['list'];
  operator: string;
  now: Date;
  /** 是否忽略已存在用户 */
  ignoreExist?: boolean;
}) {
  if (!list.length) {
    return [];
  }

  const user: UserItem[] = [];
  const userRole: UserRoleItem[] = [];

  list.forEach(({ username, nickname, email, password, role_id }) => {
    const user_id = randomUUID();

    const item: UserItem = {
      nickname,
      email,
      password,
      available: true,
      last_login_timestamp: null,
      extra: null,
      create_timestamp: now,
      create_user_id: operator,
      last_update_user_id: operator,
      last_update_timestamp: now,
      user_id,
      username,
    };
    user.push(item);

    role_id?.forEach((role_id) => {
      const item: UserRoleItem = {
        user_id,
        role_id,
        last_update_user_id: operator,
        last_update_timestamp: now,
      };
      userRole.push(item);
    });
  });

  const insertUser = await db.transaction(async (tx) => {
    const exist = await tx
      .select({
        user_id: schemas.user.user_id,
        username: schemas.user.username,
        nickname: schemas.user.nickname,
      })
      .from(schemas.user)
      .where(inArray(schemas.user.username, user.map(({ username }) => username)));

    let needInsertUser: UserItem[] = user.slice();
    let needInsertUserRole: UserRoleItem[] = userRole.slice();

    if (exist.length) {
      if (ignoreExist) {
        const existSet = new Set(exist.map(({ username }) => username));
        needInsertUser = user.filter(({ username }) => !existSet.has(username));
        const needUserIdSet = new Set(needInsertUser.map(({ user_id }) => user_id));
        needInsertUserRole = userRole.filter(
          ({ user_id }) => needUserIdSet.has(user_id),
        );
        if (!user.length) {
          return exist;
        }
      } else {
        throw new ROOT_ERROR('用户管理: 已存在同名用户');
      }
    }

    const insertUserResult = needInsertUser.length
      ? await tx
          .insert(schemas.user)
          .values(needInsertUser)
          .returning({
            user_id: schemas.user.user_id,
            username: schemas.user.username,
            nickname: schemas.user.nickname,
          })
      : [];

    if (needInsertUserRole.length) {
      await tx.insert(schemas.user_role).values(needInsertUserRole);
    }

    return [...exist, ...insertUserResult];
  });
  return insertUser;
}

const { api } = routerHandler({
  url: '/sys/user/create',
  method: 'POST',
  permission: adminPermissionKey('actions.user.create'),
  handler: async ({ body: { list }, operator, now }) => {
    await createUser({ list, operator, now });
    return 'ok';
  },
});

export default api;
