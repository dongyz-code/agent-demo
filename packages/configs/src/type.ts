import type { MEDO_ENV } from '@repo/types';

export type * from '@repo/types';

/** 环境变量 */
export type ProcessEnv = {
  /** 性能优化（可选） */
  NODE_ENV?: 'production';
  /** 环境标识 */
  MEDO_ENV?: MEDO_ENV;
  /** 是否是线上环境 */
  MEDO_PROD?: '1';
};

/** 项目启动配置文件 */
export type CONF = {
  /** redis 配置 */
  redis: {
    /** host */
    host: string;
    /** 端口 */
    port: number;
  };
  /** elasticsearch 配置 */
  es: {
    /** origin 协议 + host + 端口 */
    node: string;
  };
  /** 身份认证相关 */
  authorization: {
    /** jwt 加密密钥 16-32 位 */
    jwt_secret: string;
    /** jwt token 有效期, 秒 */
    jwt_exp: number;
    /** 管理员账户 */
    admin: {
      username: string;
      password: string;
      nickname?: string;
      email?: string;
    };
  };
};
