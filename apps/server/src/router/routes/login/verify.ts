import { routerHandler } from '@/router/utils.js';
import { authentication } from '@/router/authentication.js';
import { ROOT } from '@/configs/env.js';
import { getPermission } from './login.js';
import { addUserLog } from '@/hooks/user-log/index.js';

import type { ApiLogin } from '@/types/index.js';

const { api } = routerHandler({
  url: '/login/verify',
  method: 'POST',
  handler: async ({
    __token: { username, user_id, nickname, iat, exp },
    reply,
    ip,
  }) => {
    const isAdmin = user_id === ROOT.SYS_ADMIN_USER_ID;

    const result: Omit<ApiLogin.Login['verify']['resp'], 'timestamp'> = {
      permission: isAdmin ? [] : await getPermission({ user_id }),
      user: { username, nickname },
    };

    if (isAdmin) {
      result.user.sys_admin = true;
    }

    /** 时间过半重置 token */
    if (Date.now() / 1e3 - iat > (exp - iat) / 2) {
      const token = authentication.jwtSign({
        user_id,
        username,
        nickname,
      });
      authentication.cookieSign(reply, { token });
      result.token = token;
      addUserLog({
        key: 'user.login-by-token',
        user_id,
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
