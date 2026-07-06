import type { APIRoutes, APISource, PinoLogLevel } from '@repo/utils-node';
import type { API } from '@repo/types';
import type { OAuth2Configs } from '@repo/openid';

export type * from '@repo/types';

/** 额外补充的配置 */
export type ConfExtra = {
  /** 日志配置，不配置时使用服务端默认结构化日志策略。 */
  logging?: {
    /** 全局运行日志级别，作为 fastify/system 未单独配置时的兜底。 */
    level?: PinoLogLevel;
    /** Fastify 请求日志级别，用于控制接口耗时和错误摘要输出。 */
    fastifyLevel?: PinoLogLevel;
    /** 系统日志级别，用于控制启动、任务、异常和外部调用日志输出。 */
    systemLevel?: PinoLogLevel;
    /** 是否输出到 stdout；生产默认在文件日志开启时关闭，避免默认双写。 */
    stdout?: boolean;
    /** 本地文件日志配置，作为 stdout 之外的短期兜底。 */
    file?: {
      /** 是否启用本地文件日志，默认启用。 */
      enabled?: boolean;
      /** 本地日期日志目录保留天数，默认 30 天。 */
      retentionDays?: number;
    };
  };
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
