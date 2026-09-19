import { pipeUIMessageStreamToResponse, toUIMessageStream } from 'ai';

import type { FastifyReply } from '@repo/utils-node';
import { chatAgent } from '@/hooks/agents/agents/index.js';
import { routerHandler } from '@/router/utils.js';

/**
 * 提取 @fastify/cors 已写入 reply 的实际响应所需跨域头。
 *
 * @param reply 当前 Fastify 响应对象。
 * @returns 可安全传给流式响应的跨域头；无 CORS 头时为空对象。
 */
function getHijackCorsHeaders(reply: FastifyReply) {
  const headers: Record<string, string> = {};
  for (const name of [
    'access-control-allow-origin',
    'access-control-allow-credentials',
    'access-control-expose-headers',
    'vary',
  ]) {
    const value = reply.getHeader(name);
    if (value === undefined) {
      continue;
    }
    headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return headers;
}

const { api } = routerHandler({
  url: '/agent/chat',
  method: 'POST',
  handler: async ({ body, __token, reply, request }) => {
    const abortController = new AbortController();
    const abort = () => abortController.abort();
    request.raw.once('aborted', abort);
    reply.raw.once('close', () => {
      request.raw.removeListener('aborted', abort);
      abortController.abort();
    });

    const result = await chatAgent({
      conversation_id: body.conversation_id,
      system:
        body.system ??
        '你是助手。若绑定了知识库，回答前先调用 searchKnowledgeBase 检索。',
      message: body.message,
      reasoning: body.reasoning,
      userId: __token.user_id,
      now: new Date(),
      dataset_id: body.dataset_id,
      abortSignal: abortController.signal,
    });

    // SSE：v7 用 standalone toUIMessageStream + pipeUIMessageStreamToResponse
    //（StreamTextResult 上的同名方法已 @deprecated）。
    // conversation_id 通过响应头回传客户端，供下次请求续聊。
    const responseHeaders = {
      ...getHijackCorsHeaders(reply),
      'x-conversation-id': result.conversation_id,
    };
    reply.hijack();

    pipeUIMessageStreamToResponse({
      response: reply.raw,
      stream: toUIMessageStream({ stream: result.stream.stream }),
      headers: responseHeaders,
    });
  },
});

export default api;
