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

/** S3 兼容对象存储连接配置，当前用于 MinIO 私有文件存储。 */
export interface S3StorageConf {
  /** 服务端访问对象存储的内部地址。 */
  internalEndpoint: string;
  /** 浏览器使用预签名 URL 时实际访问的公开地址。 */
  publicEndpoint: string;
  /** S3 区域；MinIO 单机环境可使用固定区域。 */
  region?: string;
  /** 仅服务端持有的访问密钥。 */
  accessKey: string;
  /** 仅服务端持有的私密密钥。 */
  secretKey: string;
  /** 存储原文件与派生文件的私有 Bucket。 */
  bucket: string;
}

/** 通用上传行为配置，未填写字段使用服务端安全默认值。 */
export interface UploadConf {
  /** 预签名 URL 有效秒数。 */
  presignExpiresSeconds?: number;
  /** 达到该字节数时使用 Multipart。 */
  multipartThresholdBytes?: number;
  /** Multipart 默认分片字节数。 */
  partSizeBytes?: number;
  /** 单文件最大字节数。 */
  maxFileSizeBytes?: number;
  /** 单次允许签发的最大分片数量。 */
  maxSignedParts?: number;
  /** 上传会话有效秒数。 */
  sessionExpiresSeconds?: number;
  /** 未绑定文件保留天数。 */
  unboundRetentionDays?: number;
  /** 严格验证阶段读取文本预览的最大字节数。 */
  maxTextPreviewBytes?: number;
  /** Office 预览 Worker 地址；未配置时安全降级为不可预览。 */
  officePreviewEndpoint?: string;
}

/** 通用文档处理配置。 */
export interface DocumentConf {
  /** PDF/Office 统一解析服务地址；未配置时相关类型返回明确不支持错误。 */
  parserEndpoint?: string;
  /** 外部解析服务超时毫秒数。 */
  parserTimeoutMs?: number;
  /** 默认 Segment 目标 token 数。 */
  segmentSizeTokens?: number;
  /** 相邻 Segment 重叠 token 数。 */
  segmentOverlapTokens?: number;
}

/** 文件处理任务配置。 */
export interface FileProcessingConf {
  /** 文件管理上传时是否默认进入 RAG 接入流程。 */
  defaultEnterRag?: boolean;
  /** 单个服务实例允许并行执行的文件处理任务数。 */
  workerConcurrency?: number;
  /** 执行中任务失去心跳的判定秒数。 */
  staleTaskSeconds?: number;
  /** 是否启用新文件处理流程，用于迁移期回滚。 */
  enabled?: boolean;
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
  /** 对象存储配置。 */
  storage: {
    /** S3 兼容存储配置。 */
    s3: S3StorageConf;
  };
  /** 通用文件上传配置。 */
  upload?: UploadConf;
  /** 通用文档处理配置。 */
  document?: DocumentConf;
  /** 文件处理任务配置。 */
  fileProcessing?: FileProcessingConf;
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
