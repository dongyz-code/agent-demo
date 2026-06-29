import type { Routes, RoutesSource, TokenDataWithExp } from '@/types/index.js';
import { adminPermissionRouteConfigKey } from '@/hooks/admin-permission/index.js';
import type {
  FastifyRequest,
  FastifyReply,
  FastifySchema,
  RouteOptions,
} from '@repo/utils-node';
import type { AuthenticationContext } from '@repo/utils-node';
import type {
  AdminPermissionRequirement,
  AdminPermissionRule,
} from '@/hooks/admin-permission/index.js';

/** 当前服务端 route handler 使用的认证上下文类型。 */
type RouteAuth = AuthenticationContext<TokenDataWithExp>;

/** 当前路由动态权限规则可读取的类型化请求上下文。 */
type RoutePermissionContext<T extends keyof RoutesSource> = {
  /** 请求体。 */
  body: RoutesSource[T]['body'];
  /** 查询字符串。 */
  query: RoutesSource[T]['query'];
  /** 路径参数。 */
  params: RoutesSource[T]['params'];
  /** Fastify 原始请求对象。 */
  request: FastifyRequest;
};

/** routeHandler 支持注册的权限规则。 */
type RoutePermissionRule<T extends keyof RoutesSource> =
  | AdminPermissionRequirement
  | ((
      context: RoutePermissionContext<T>,
    ) => AdminPermissionRequirement | Promise<AdminPermissionRequirement>);

export function routerHandler<T extends keyof RoutesSource>({
  url,
  method,
  schema,
  permission,
  handler: _handler,
}: {
  url: T;
  method: RoutesSource[T]['method'];
  schema?: FastifySchema;
  /** 接口所需的 admin 权限；真正校验由 authentication.ts 中的统一拦截链执行。 */
  permission?: RoutePermissionRule<T>;
  handler: (opts: {
    /** 当前时间 */
    now: Date;
    /** 请求IP */
    ip: string;
    /** 操作人 */
    operator: string;
    /** 请求体 */
    body: RoutesSource[T]['body'];
    /** 查询字符串 */
    query: RoutesSource[T]['query'];
    /** 路径参数 */
    params: RoutesSource[T]['params'];
    /** 认证上下文 */
    auth: RouteAuth | undefined;
    /** TokenData */
    __token: TokenDataWithExp;
    /** 请求 */
    request: FastifyRequest;
    /** 响应 */
    reply: FastifyReply;
  }) => Promise<RoutesSource[T]['resp']>;
}) {
  const handler: RouteOptions['handler'] = async (request, reply) => {
    const { body, ip, query, params } = request;
    const auth = request.auth as RouteAuth | undefined;
    const __token = auth?.token as TokenDataWithExp;

    return await _handler({
      now: new Date(),
      ip,
      operator: __token?.user_id ?? '',
      body: body as RoutesSource[T]['body'],
      query: query as RoutesSource[T]['query'],
      params: params as RoutesSource[T]['params'],
      auth,
      __token,
      request,
      reply,
    });
  };

  const api: RouteOptions = {
    method,
    url,
    schema,
    config: permission
      ? ({
          [adminPermissionRouteConfigKey]: permission as AdminPermissionRule,
        } as unknown as RouteOptions['config'])
      : undefined,
    handler,
  };

  return {
    api: api as unknown as Routes[T],
    handler: _handler,
  };
}
