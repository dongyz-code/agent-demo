import type { APIRoutes, APISource, PinoLogLevel } from '@repo/utils-node';
import type { API } from '@repo/types';

export type * from '@repo/types';

/** AI 语言模型供应商的连接配置，来自根配置文件的 `AI` 节点。 */
export interface AiProviderSecret {
  /** 调用供应商时使用的密钥；按各 SDK 协议写入对应鉴权头（OpenAI 兼容走 Authorization，Google 走 x-goog-api-key）。 */
  apiKey: string;
  /** 供应商代理的基础地址，不包含具体模型路径；非代理型供应商（如 Google 官方 SDK）可不填。 */
  baseUrl?: string;
  /** 需要额外透传给代理服务的固定请求头，适合放租户、网关或调试标识。 */
  headers?: Record<string, string>;
}

/**
 * 当前服务端支持的 AI 供应商名；同时是 conf.json `AI` 节点的键。
 * 配置是基础：新增供应商先在此登记键，再到 conf.json 补 secret，最后在 providers/ 补模型清单与工厂。
 */
export type AiProvider = 'bailian' | 'volcengine' | 'awsBedrock' | 'google';

/** 根配置文件中 `AI` 节点支持的供应商配置；键由 `AiProvider` 派生，避免重复声明。 */
export type AiConf = { [P in AiProvider]?: AiProviderSecret };

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
  /** AI 供应商配置，密钥和代理地址统一放在本地 conf.json 的 `AI` 节点。 */
  AI?: AiConf;
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
