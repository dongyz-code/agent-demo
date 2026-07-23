import { routerHandler } from '@/router/utils.js';
import { authentication } from '@/router/authentication.js';
import { ROOT } from '@/configs/env.js';
import { ROOT_ERROR } from '@/configs/error.js';
import { db, schemas } from '@/database/index.js';
import { getSha256Hex } from '@/utils/index.js';
import { addUserLog } from '@/hooks/user-log/index.js';
import { getAdminPermissionContext } from '@/router/permission.js';
import { and, eq } from 'drizzle-orm';

import type { ApiLogin } from '@/types/index.js';

/**
 * 读取普通用户当前有效权限。
 *
 * @param opts.user_id 当前登录用户 ID。
 * @returns 启用角色聚合后的有效 admin 权限 key 列表。
 */
export async function getPermission(opts: { user_id: string }) {
  const { user_id } = opts;
  const context = await getAdminPermissionContext(user_id);
  return [...context.permissions];
}

const { admin } = ROOT.authorization;

const adminPass = [
  admin.password,
  getSha256Hex(admin.username + admin.password),
];

type UserItem = {
  user_id: string;
  username: string;
  nickname: string;
  sys_admin?: boolean;
};

async function getUserItem(
  body: ApiLogin.Login['login']['req'],
): Promise<UserItem | undefined> {
  const { username, password } = body;

  if (username == admin.username && adminPass.includes(password)) {
    return {
      user_id: ROOT.SYS_ADMIN_USER_ID,
      username,
      nickname: admin.nickname ?? '-',
      sys_admin: true,
    };
  }
  const [item] = await db
    .select({
      user_id: schemas.user.user_id,
      nickname: schemas.user.nickname,
    })
    .from(schemas.user)
    .where(
      and(
        eq(schemas.user.username, username),
        eq(schemas.user.password, password),
      ),
    )
    .limit(1);
  if (item) {
    return {
      user_id: item.user_id,
      username,
      nickname: item.nickname,
    };
  }
}

const { api } = routerHandler({
  url: '/login/login',
  method: 'POST',
  handler: async ({ body, reply, ip }) => {
    const userItem = await getUserItem(body);

    if (!userItem) {
      throw new ROOT_ERROR('认证: 身份校验失败');
    }

    const token = authentication.jwtSign({
      user_id: userItem.user_id,
      username: userItem.username,
      nickname: userItem.nickname,
    });
    authentication.cookieSign(reply, { token });

    const result: Omit<ApiLogin.Login['login']['resp'], 'timestamp'> = {
      token,
      permission: [],
      user: {
        username: userItem.username,
        nickname: userItem.nickname,
      },
    };

    if (userItem.sys_admin) {
      result.user.sys_admin = true;
    } else {
      result.permission = await getPermission({ user_id: userItem.user_id });

      /** 更新最后登录时间 */
      await db
        .update(schemas.user)
        .set({
          last_login_timestamp: new Date(),
        })
        .where(eq(schemas.user.user_id, userItem.user_id));

      addUserLog({
        key: 'user.login',
        user_id: userItem.user_id,
        ip,
      });
    }

    return {
      ...result,
      timestamp: Date.now(),
    };
  },
});

export default api;
