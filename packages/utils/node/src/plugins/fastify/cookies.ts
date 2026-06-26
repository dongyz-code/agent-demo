import type { FastifyReply } from './types.js';
import type { CookieSerializeOptions } from '@fastify/cookie';

/** 批量写入 cookie，调用方负责传入安全相关序列化选项。 */
export function cookieSign({
  reply,
  cookies,
  cookieSerializeOptions,
}: {
  /** Fastify 响应对象。 */
  reply: FastifyReply;
  /** cookie 名称和值。 */
  cookies: Record<string, string>;
  /** cookie 序列化配置。 */
  cookieSerializeOptions?: CookieSerializeOptions;
}) {
  Object.entries(cookies).forEach(([name, value]) => {
    reply.setCookie(name, value, cookieSerializeOptions);
  });
}
