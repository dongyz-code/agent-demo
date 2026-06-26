export type * from '@repo/types';

/** 环境变量 */
export type ProcessEnv = {
  /** 性能优化（可选） */
  NODE_ENV?: 'production';
  /** 是否按生产环境行为运行，值为 '1' 时启用生产模式 */
  APP_PROD?: '1';
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
