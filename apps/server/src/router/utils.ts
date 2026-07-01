import type { Routes, RoutesSource, TokenDataWithExp } from '@/types/index.js';
import { adminPermissionRouteConfigKey } from './permission.js';
import type {
  FastifyRequest,
  FastifyReply,
  FastifySchema,
  RouteOptions,
} from '@repo/utils-node';
import type { AuthenticationContext } from '@repo/utils-node';
import type { AdminPermissionRule } from './permission.js';

/** 当前服务端 route handler 使用的认证上下文类型。 */
type RouteAuth = AuthenticationContext<TokenDataWithExp>;

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
  /** 接口唯一 admin 权限；真正校验由 router/permission.ts 中的 preHandler 执行。 */
  permission?: AdminPermissionRule;
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
