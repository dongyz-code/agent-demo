import { addApiLog, hiddenData } from './utils.js';

import type {
  FastifyReply,
  FastifyRequest,
  FastifyInstance,
  AuthenticationContext,
} from '@repo/utils-node';
import type { ItemAdd } from './utils.js';
import type { TokenDataWithExp } from '@/types/index.js';

type Params = {
  request: FastifyRequest;
  reply: FastifyReply;
  payload: unknown;
};

async function _addApiListenLog({ request, reply, payload }: Params) {
  if (!request.url.startsWith('/api/interface/')) {
    return;
  }

  /** https://fastify.dev/docs/latest/Reference/Request/ */

  const { url, headers, body, ip, method } = request;
  const { authorization, ...rest } = (headers ?? {}) as {
    authorization?: string;
  };
  const auth = request.auth as
    | AuthenticationContext<TokenDataWithExp>
    | undefined;
  const token = auth?.token;

  const { statusCode } = reply;

  const start_timestamp = new Date();
  const end_timestamp = new Date();
  const detail: Record<string, unknown> = {};

  detail.url = url;
  detail.req = hiddenData({ headers: rest, method, data: body });
  detail.resp = hiddenData({
    statusCode,
    headers: reply.getHeaders(),
    data: payload,
  });

  const duration = Math.ceil(reply.elapsedTime);

  start_timestamp.setMilliseconds(start_timestamp.getMilliseconds() - duration);

  const val: ItemAdd = {
    status: statusCode !== 200 ? 'failed' : 'completed',
    start_timestamp,
    end_timestamp,
    duration,
    mode: 'passive',
    client_mark: null,
    client_id: token?.client_id ?? null,
    ip,
    detail: JSON.stringify(detail),
    url,
    user_id: null,
    search_key: null,
  };

  // console.log(val);

  await addApiLog(val);
}

/** 添加接口请求日志 (不抛出错误) */
export async function addApiListenLog(body: any) {
  try {
    await _addApiListenLog(body);
  } catch (error) {
    console.error(error);
  }
}

export async function useApiLogListen(fastify: FastifyInstance) {
  fastify.addHook('onSend', async (request, reply, payload) => {
    addApiListenLog({ request, reply, payload });
    return payload;
  });
}
