import type { FastifyInstance } from './types.js';
import type { Readable } from 'node:stream';

/** 判断响应是否是 Node stream。 */
function isStream(payload: unknown): payload is Readable {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      typeof (payload as Partial<Readable>).pipe === 'function',
  );
}

/** 判断内容类型是否表示 JSON 响应。 */
function isJsonContentType(contentType: unknown) {
  return typeof contentType === 'string' && contentType.includes('json');
}

/** 尝试把 onSend 的字符串 payload 解析成 JSON。 */
function parseJsonPayload(payload: string) {
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return undefined;
  }
}

/** 判断响应对象是否已经带有统一外壳。 */
function hasEnvelope(payload: unknown) {
  return (
    payload !== null &&
    payload !== undefined &&
    typeof payload === 'object' &&
    ('data' in payload || 'error' in payload)
  );
}

/** 注册统一成功响应包裹 hook，错误和特殊响应不会被重复包裹。 */
export function registerResponseEnvelope(fastify: FastifyInstance) {
  fastify.addHook('onSend', async (_request, reply, payload) => {
    if (
      payload == null ||
      Buffer.isBuffer(payload) ||
      isStream(payload) ||
      reply.statusCode >= 400
    ) {
      return payload;
    }

    if (typeof payload !== 'string') {
      return payload;
    }

    const contentType = reply.getHeader('content-type');
    if (!isJsonContentType(contentType)) {
      return payload;
    }

    const parsed = parseJsonPayload(payload);
    if (parsed == null || hasEnvelope(parsed)) {
      return payload;
    }

    reply.header('content-type', 'application/json; charset=utf-8');
    return JSON.stringify({ data: parsed });
  });
}
