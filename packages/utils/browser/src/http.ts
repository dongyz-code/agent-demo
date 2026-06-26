import axios from 'axios';

import type {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import type {
  APISource,
  ApiRouteBody,
  ApiRouteItem,
  ApiRouteParams,
  ApiRouteQuery,
  ApiRouteRequest,
  ApiRouteResponse,
} from '@repo/types';

/** 显式请求部位，适用于同时需要 body、query、路径 params 的接口。 */
type ApiRequestParts<T extends ApiRouteItem> = Partial<
  ([ApiRouteBody<T>] extends [never]
    ? {}
    : {
        /** 请求体。 */
        body: ApiRouteBody<T>;
      }) &
    ([ApiRouteQuery<T>] extends [never]
      ? {}
      : {
          /** 查询字符串。 */
          query: ApiRouteQuery<T>;
        }) &
    ([ApiRouteParams<T>] extends [never]
      ? {}
      : {
          /** 路径参数，用于替换 URL 中的 :name 片段。 */
          params: ApiRouteParams<T>;
        })
>;

/** 浏览器 API 调用参数，兼容旧单参数写法并支持显式请求部位。 */
type ApiRequestData<T extends ApiRouteItem> =
  | ApiRouteRequest<T>
  | ApiRequestParts<T>;

/** 将共享 API 契约收敛成浏览器请求函数可消费的路由映射。 */
type ApiRouteSource<T extends { routes: Record<string, unknown> }> =
  APISource<T> extends infer Source extends Record<string, ApiRouteItem>
    ? Source
    : never;

/** 按路由路径声明运行时 HTTP 方法；类型信息会在编译后擦除，所以运行时需要显式映射。 */
type ApiMethodMap<
  T extends { routes: Record<string, unknown> },
  Source extends Record<string, ApiRouteItem> = ApiRouteSource<T>,
> = Partial<{
  [K in keyof Source & string]: Source[K]['method'];
}>;

/** 基于共享 API 契约生成的浏览器请求函数类型。 */
type ApiFunc<
  T extends { routes: Record<string, unknown> },
  Source extends Record<string, ApiRouteItem> = ApiRouteSource<T>,
> = <K extends keyof Source & string>(
  url: K,
  data: ApiRequestData<Source[K]>,
  config?: AxiosRequestConfig & {
    /** 单次请求覆盖的 HTTP 方法，优先级高于 getAxios 的 methods 映射。 */
    method?: Source[K]['method'];
  },
) => Promise<ApiRouteResponse<Source[K]>>;

/** 判断对象是否声明了指定自有字段。 */
function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** 判断调用方是否使用了显式请求部位写法。 */
function isRequestParts(value: unknown): value is {
  /** 请求体。 */
  body?: unknown;
  /** 查询字符串。 */
  query?: unknown;
  /** 路径参数。 */
  params?: Record<string, unknown>;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    hasOwn(value, 'body') ||
    hasOwn(value, 'query') ||
    hasOwn(value, 'params')
  );
}

/** 判断值是否是普通对象，便于合并 query 参数。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 合并 Axios config.params 和契约 query，后者优先。 */
function mergeQueryParams(base: unknown, query: unknown) {
  if (base === undefined) {
    return query;
  }
  if (query === undefined) {
    return base;
  }
  if (isRecord(base) && isRecord(query)) {
    return {
      ...base,
      ...query,
    };
  }
  return query;
}

/** 使用路径参数替换 URL 中的 :name 片段。 */
function applyPathParams(url: string, params: Record<string, unknown> | undefined) {
  if (!params) {
    return url;
  }
  return Object.entries(params).reduce((next, [key, value]) => {
    return next.replaceAll(`:${key}`, encodeURIComponent(String(value)));
  }, url);
}

export function getAxios<T extends { routes: Record<string, unknown> }>({
  origin = '',
  prefix = '',
  config,
  callback,
  methods,
}: {
  origin?: string;
  prefix?: string;
  cache?: Record<string, unknown>;
  config?: AxiosRequestConfig;
  callback?: (instance: AxiosInstance) => void;
  /** 路由方法映射，用于运行时决定默认 GET/POST 等方法。 */
  methods?: ApiMethodMap<T>;
}) {
  const instance = axios.create({
    baseURL: `${origin}${prefix}`,
    ...config,
  });

  callback?.(instance);
  const methodMap = methods as Record<string, string> | undefined;

  const api = (async (
    url: string,
    data: unknown,
    config?: AxiosRequestConfig,
  ) => {
    const method = (config?.method ?? methodMap?.[url] ?? 'POST').toUpperCase();
    const requestParts: {
      /** 请求体。 */
      body?: unknown;
      /** 查询字符串。 */
      query?: unknown;
      /** 路径参数。 */
      params?: Record<string, unknown>;
    } = isRequestParts(data)
      ? data
      : method === 'GET'
        ? { query: data }
        : { body: data };
    const requestUrl = applyPathParams(url, requestParts.params);
    const response: AxiosResponse = await instance.request({
      ...config,
      url: requestUrl,
      method,
      params: mergeQueryParams(config?.params, requestParts.query),
      data: requestParts.body,
    });
    return (response.data && 'data' in response.data
      ? response.data.data
      : response.data) as Awaited<ReturnType<ApiFunc<T>>>;
  }) as ApiFunc<T>;

  return {
    axios: instance,
    api,
  };
}
