import type { APIRoutes, APISource, PinoLogLevel } from '@repo/utils-node';
import type { API } from '@repo/types';

export type * from '@repo/types';

/** AI 语言模型供应商的连接配置，来自根配置文件的 `AI` 节点。 */
export interface AiProviderSecret {
  /** 调用供应商代理时使用的密钥；会按 OpenAI 兼容协议写入 Authorization 请求头。 */
  apiKey: string;
  /** 供应商代理的基础地址，不包含具体模型路径。 */
  baseUrl: string;
  /** 需要额外透传给代理服务的固定请求头，适合放租户、网关或调试标识。 */
  headers?: Record<string, string>;
}

/** 根配置文件中 `AI` 节点支持的语言模型供应商配置。 */
export interface AiConf {
  /** 阿里云百炼代理配置，承载千问、GLM 等百炼 compatible-mode 模型。 */
  bailian?: AiProviderSecret;
  /** 字节火山引擎代理配置，承载豆包系列模型。 */
  volcengine?: AiProviderSecret;
  /** AWS Bedrock 代理配置，当前用于 Anthropic 系列模型。 */
  awsBedrock?: AiProviderSecret;
}

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
