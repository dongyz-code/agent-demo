import type { APIRoutes, APISource } from '@repo/utils-node';
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

/** TextIn 文档解析服务连接配置。 */
export interface TextInSecret {
  /** 调用 TextIn 代理时使用的 Bearer Token。 */
  apiKey: string;
  /** TextIn 文档解析完整接口地址。 */
  baseUrl: string;
}

/** 根配置文件中 `AI` 节点支持的模型供应商与文档解析服务配置。 */
export type AiConf = { [P in AiProvider]?: AiProviderSecret } & {
  /** TextIn 文档解析独立连接配置，不参与语言模型供应商派发。 */
  textIn?: TextInSecret;
};

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

/**
 * 额外补充的服务端配置，包括基础设施连接与需要按部署环境切换的外部服务地址。
 */
export type ConfExtra = {
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
  /** AI 模型与文档解析服务配置，密钥和代理地址统一放在本地 conf.json 的 `AI` 节点。 */
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
