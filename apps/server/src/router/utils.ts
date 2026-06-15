import type { Routes, RoutesSource, TokenDataWithExp } from '@/types/index.js';
import type {
  FastifyRequest,
  FastifyReply,
  RouteOptions,
} from '@repo/utils-node';

export function routerHandler<T extends keyof RoutesSource>({
  url,
  method,
  handler: _handler,
}: {
  url: T;
  method: RoutesSource[T]['method'];
  handler: (opts: {
    /** 当前时间 */
    now: Date;
    /** 请求IP */
    ip: string;
    /** 操作人 */
    operator: string;
    /** 请求体 */
    body: RoutesSource[T]['req'];
    /** TokenData */
    __token: TokenDataWithExp;
    /** 请求 */
    request: FastifyRequest;
    /** 响应 */
    reply: FastifyReply;
  }) => Promise<RoutesSource[T]['resp']>;
}) {
  const handler: RouteOptions['handler'] = async (request, reply) => {
    const { headers, body, ip, query } = request;
    const { __token } = headers as unknown as {
      __token: TokenDataWithExp;
    };

    return await _handler({
      now: new Date(),
      ip,
      operator: __token?.user_id,
      body: (body ?? query) as any,
      __token,
      request,
      reply,
    });
  };

  const api: RouteOptions = {
    method,
    url,
    handler,
  };

  return {
    api: api as unknown as Routes[T],
    handler: _handler,
  };
}
