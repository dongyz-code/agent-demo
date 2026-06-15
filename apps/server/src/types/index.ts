import type { APIRoutes, APISource } from '@repo/utils-node';
import type { API } from '@repo/types';
import type { OAuth2Configs } from '@repo/openid';

export type * from '@repo/types';

/** 额外补充的配置 */
export type ConfExtra = {
  pg: {
    host: string;
    port: number;
    database: string;
    path: string;
    user: string;
    password: string;
  };
  openid?: {
    /** OAuth2 配置 */
    configs: OAuth2Configs;
    /** 默认角色列表 */
    defaultRoleIds?: string[];
  };
};

export type TokenData = {
  user_id: string;
  username: string;
  nickname: string;
  //
  client_id?: string;
};

export type CookieData = {
  token: string;
};

export type TokenDataWithExp = TokenData & {
  /** 签发时间（秒） */
  iat: number;
  /** 过期时间（秒） */
  exp: number;
};

export type Routes = APIRoutes<
  API,
  {
    headers: {
      token: string;
      __token: TokenDataWithExp;
    };
  }
>['routes'];

export type RoutesSource = APISource<API>;
