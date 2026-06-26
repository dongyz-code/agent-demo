import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  FastifyServerOptions,
  RouteOptions,
} from 'fastify';
import type {
  APISource,
  ApiRouteBody,
  ApiRouteItem,
  ApiRouteParams,
  ApiRouteQuery,
  ApiRouteResponse,
} from '@repo/types';

declare module 'fastify' {
  interface FastifyRequest {
    /** 当前请求的认证上下文，由认证 hook 写入，业务代码不应写入 headers 承载内部状态。 */
    auth?: unknown;
  }
}

export type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  FastifyServerOptions,
  RouteOptions,
} from 'fastify';
export type { APISource } from '@repo/types';

/** 将字段覆盖合并到原类型，保留未覆盖字段。 */
type Merge<T, K> = Omit<T, keyof K> & K;

/** 额外注入到 Fastify request headers 的类型。 */
type ProvidedHeaders<Provide> = Provide extends {
  headers: infer Headers extends Record<string, unknown>;
}
  ? Headers
  : {};

/** 将共享 API 契约收敛成 Fastify 可消费的路由映射，避免重复展开深层条件类型。 */
type ApiRouteSource<T extends { routes: Record<string, unknown> }> =
  APISource<T> extends infer Source extends Record<string, ApiRouteItem>
    ? Source
    : never;

/** 根据共享 API 契约生成 Fastify route 配置类型。 */
export type APIRoutes<
  T extends { prefix: string; routes: Record<string, unknown> },
  Provide extends { headers?: Record<string, unknown> } = {},
  Source extends Record<string, ApiRouteItem> = ApiRouteSource<T>,
> = {
  /** API 前缀。 */
  prefix: T['prefix'];
  /** 完整路径到 Fastify route options 的映射。 */
  routes: {
    [K in keyof Source]: K extends string
      ? Merge<
          RouteOptions,
          {
            /** HTTP 方法。 */
            method: Source[K]['method'];
            /** 不包含 API prefix 的 route 路径。 */
            url: K;
            /** Fastify 原生 schema。 */
            schema?: FastifySchema;
            /** 带契约类型的 Fastify handler。 */
            handler: (
              request: Merge<
                FastifyRequest,
                {
                  /** 请求体。 */
                  body: ApiRouteBody<Source[K]>;
                  /** 查询字符串。 */
                  query: ApiRouteQuery<Source[K]>;
                  /** 路径参数。 */
                  params: ApiRouteParams<Source[K]>;
                  /** 请求头，包含调用方声明的额外字段。 */
                  headers: Merge<
                    FastifyRequest['headers'],
                    ProvidedHeaders<Provide>
                  >;
                }
              >,
              reply: FastifyReply,
            ) => Promise<ApiRouteResponse<Source[K]>>;
          }
        >
      : never;
  };
};
