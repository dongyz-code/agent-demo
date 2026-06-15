import { routerHandler } from '@/router/utils.js';
import { authentication } from '@/router/authentication.js';
import { ROOT } from '@/configs/env.js';
import { ROOT_ERROR } from '@/configs/error.js';
import { db, schema, whereAll } from '@/database/index.js';
import { getSha256Hex } from '@/utils/index.js';
import { addUserLog } from '@/hooks/user-log/index.js';
import { useOpenid } from '@/hooks/openid/index.js';
import { createUser } from '../sys/user.create.js';
import { eq, inArray } from 'drizzle-orm';

import type { ApiLogin } from '@/types/index.js';

/** 非管理员的权限 */
export async function getPermission({ user_id }: { user_id: string }) {
  const roles = await db
    .select({ role_id: schema.user_role.role_id })
    .from(schema.user_role)
    .where(eq(schema.user_role.user_id, user_id));
  if (roles.length) {
    const vals = await db
      .select({ permission: schema.role.permission })
      .from(schema.role)
      .where(inArray(schema.role.role_id, roles.map((x) => x.role_id)));

    const temp = new Set<string>();
    vals.forEach(({ permission }) => {
      if (permission) {
        (JSON.parse(permission) as string[]).forEach((x) => {
          temp.add(x);
        });
      }
    });
    return [...temp];
  }

  return [];
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
  if ('state' in body) {
    /** 自动注册 */
    const { state, url } = body;
    if (state === 'Casdoor') {
      const { authorizationCodeGrant, fetchUserInfo } = useOpenid();

      const tokens = await authorizationCodeGrant({ url, state });
      const userInfo = await fetchUserInfo(tokens);

      const { email, name, preferred_username } = userInfo.userInfo;
      if (!email || !name || !preferred_username) {
        return;
      }

      const user = await createUser({
        list: [
          {
            username: preferred_username,
            nickname: name,
            email,
            password: null,
            role_id: ROOT.openid?.defaultRoleIds ?? [],
          },
        ],
        operator: ROOT.SYS_ADMIN_USER_ID,
        now: new Date(),
        ignoreExist: true,
      });
      const [item] = user;

      return {
        user_id: item.user_id,
        username: item.username,
        nickname: item.nickname,
      };
    }
  } else {
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
        user_id: schema.user.user_id,
        nickname: schema.user.nickname,
      })
      .from(schema.user)
      .where(
        whereAll(
          eq(schema.user.username, username),
          eq(schema.user.password, password),
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
        .update(schema.user)
        .set({
          last_login_timestamp: new Date(),
        })
        .where(eq(schema.user.user_id, userItem.user_id));

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
