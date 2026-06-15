import type { ApiMultAction } from '../../common/index.js';

/** 登录返回的信息 */
export type LOGIN_RESPONSE = {
  token?: string;
  timestamp: number;
  permission: string[];
  user: {
    username: string;
    nickname: string;
    sys_admin?: boolean;
  };
};

export type Login = ApiMultAction<{
  login: {
    req:
      | {
          /** 账户密码登录 */
          username: string;
          password: string;
        }
      | {
          /** 状态标记，来源 */
          state: string;
          /** 授权后的回调URL（带CODE） */
          url: string;
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
