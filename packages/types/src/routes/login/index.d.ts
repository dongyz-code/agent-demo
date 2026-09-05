import type { ApiMultAction } from '../../common/index.js';
import type { AdminPermissionKey } from '@repo/shared/permission';

/** 登录返回的信息 */
export type LOGIN_RESPONSE = {
  timestamp: number;
  permission: AdminPermissionKey[];
  user: {
    username: string;
    nickname: string;
    sys_admin?: boolean;
  };
};

export type Login = ApiMultAction<{
  login: {
    req: {
      /** 账户密码登录的用户名。 */
      username: string;
      /** 账户密码登录的密码，通过 HTTPS 传输并由服务端单向哈希。 */
      password: string;
    };
    resp: LOGIN_RESPONSE;
  };
  verify: {
    req: {};
    resp: LOGIN_RESPONSE;
  };
  logout: {
    req: {};
    resp: 'ok';
  };
}>;
