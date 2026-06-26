import type { UnionToIntersection } from './module.js';

/** API 路由支持的 HTTP 方法文本，允许保留 Fastify 和 Axios 的方法字符串兼容性。 */
export type ApiMethod = string;

/** 单个 API 路由契约，兼容旧 req 写法并支持按请求部位声明类型。 */
export type ApiRouteItem = {
  /** HTTP 方法，用于推导旧 req 默认落在 body 还是 query。 */
  method: ApiMethod;
  /** 旧版请求数据类型；未迁移接口继续使用该字段。 */
  req?: unknown;
  /** 请求体类型，适用于 POST、PUT、PATCH 等携带 body 的接口。 */
  body?: unknown;
  /** 查询字符串类型，适用于 GET 或带筛选条件的接口。 */
  query?: unknown;
  /** 路径参数类型，适用于包含动态路径段的接口。 */
  params?: unknown;
  /** 响应数据类型；未声明时按 ok 字符串兼容。 */
  resp?: unknown;
};

/** 获取路由方法的大写形式，便于兼容小写方法输入。 */
type ApiRouteMethod<T> = T extends { method: infer Method extends string }
  ? Uppercase<Method>
  : 'POST';

/** 判断对象是否显式声明了指定字段。 */
type HasApiField<T, Key extends PropertyKey> = Key extends keyof T
  ? true
  : false;

/** 路由 body 类型；旧 req 在非 GET 方法下按 body 兼容。 */
export type ApiRouteBody<T> = HasApiField<T, 'body'> extends true
  ? T['body' & keyof T]
  : HasApiField<T, 'req'> extends true
    ? ApiRouteMethod<T> extends 'GET'
      ? never
      : T['req' & keyof T]
    : never;

/** 路由 query 类型；旧 req 在 GET 方法下按 query 兼容。 */
export type ApiRouteQuery<T> = HasApiField<T, 'query'> extends true
  ? T['query' & keyof T]
  : HasApiField<T, 'req'> extends true
    ? ApiRouteMethod<T> extends 'GET'
      ? T['req' & keyof T]
      : never
    : never;

/** 路由 params 类型；未声明时表示没有路径参数。 */
export type ApiRouteParams<T> = HasApiField<T, 'params'> extends true
  ? T['params' & keyof T]
  : never;

/** 路由响应类型；未声明 resp 时保持旧约定返回 ok。 */
export type ApiRouteResponse<T> = HasApiField<T, 'resp'> extends true
  ? T['resp' & keyof T]
  : 'ok';

/** 前端单参数调用时使用的数据类型，优先兼容旧 req，再按 body、query、params 选择。 */
export type ApiRouteRequest<T> = HasApiField<T, 'req'> extends true
  ? T['req' & keyof T]
  : [ApiRouteBody<T>] extends [never]
    ? [ApiRouteQuery<T>] extends [never]
      ? ApiRouteParams<T>
      : ApiRouteQuery<T>
    : ApiRouteBody<T>;

/** 标准化后的路由契约，给前后端工具提供稳定字段。 */
export type ApiRouteNormalized<T> = {
  /** HTTP 方法。 */
  method: T extends { method: infer Method extends string } ? Method : 'POST';
  /** 兼容旧调用方的请求数据类型。 */
  req: ApiRouteRequest<T>;
  /** 请求体类型。 */
  body: ApiRouteBody<T>;
  /** 查询字符串类型。 */
  query: ApiRouteQuery<T>;
  /** 路径参数类型。 */
  params: ApiRouteParams<T>;
  /** 响应数据类型。 */
  resp: ApiRouteResponse<T>;
};

/** 拼接嵌套路由前缀和当前键，确保路径以 / 开头。 */
type JoinApiPath<Prefix extends string, Key extends string> =
  `${Prefix}${Key}` extends `/${infer Rest}` ? `/${Rest}` : `${Prefix}${Key}`;

/** 将嵌套 API 树铺平成以完整路径为 key 的内部映射。 */
type FlattenApiRoutes<T, Prefix extends string = ''> = UnionToIntersection<
  {
    [Key in keyof T]: Key extends string
      ? T[Key] extends { method: string }
        ? { [Path in JoinApiPath<Prefix, Key>]: ApiRouteNormalized<T[Key]> }
        : FlattenApiRoutes<T[Key], JoinApiPath<Prefix, Key>>
      : never;
  }[keyof T]
>;

/** 完整 API 路由映射，key 为完整路径，value 为标准化路由契约。 */
export type APISource<T extends { routes: Record<string, unknown> }> =
  FlattenApiRoutes<T['routes']>;

/** 单模块 action 配置，兼容旧 req 并允许新接口按请求部位声明。 */
export type ApiConfig = Record<
  string,
  {
    /** 旧版请求数据类型；新接口优先使用 body、query、params。 */
    req?: unknown;
    /** 请求体类型。 */
    body?: unknown;
    /** 查询字符串类型。 */
    query?: unknown;
    /** 路径参数类型。 */
    params?: unknown;
    /** 响应数据类型；不填默认返回 ok。 */
    resp?: unknown;
    /** HTTP 方法；不填默认 POST。 */
    method?: ApiMethod;
  }
>;

/** 所有的 Action 操作，保留业务模块现有声明形态。 */
export type ApiMultAction<T extends ApiConfig> = T;

/** 将 action 集合转换为带路径和方法的 API 路由契约。 */
export type ApiMultActionToApi<T extends ApiConfig> = {
  [Key in keyof T as `/${Key extends string ? Key : never}`]: ApiRouteNormalized<
    {
      /** 默认使用 POST，单个 action 可显式覆盖。 */
      method: T[Key] extends { method: infer Method extends string }
        ? Method
        : 'POST';
    } & T[Key]
  >;
};
