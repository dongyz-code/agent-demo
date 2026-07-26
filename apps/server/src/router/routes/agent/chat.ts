import { pipeUIMessageStreamToResponse, toUIMessageStream } from 'ai';

import { chatAgent } from '@/hooks/agents/agents/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/agent/chat',
  method: 'POST',
  handler: async ({ body, __token, reply }) => {
    const result = await chatAgent({
      conversation_id: body.conversation_id,
      system:
        body.system ??
        '你是助手。若绑定了知识库，回答前先调用 searchKnowledgeBase 检索。',
      message: body.message,
      userId: __token.user_id,
      now: new Date(),
      dataset_id: body.dataset_id,
    });
    // SSE：v7 用 standalone toUIMessageStream + pipeUIMessageStreamToResponse
    //（StreamTextResult 上的同名方法已 @deprecated）。
    // conversation_id 通过响应头回传客户端，供下次请求续聊。
    reply.hijack();
    pipeUIMessageStreamToResponse({
      response: reply.raw,
      stream: toUIMessageStream({ stream: result.stream.stream }),
      headers: { 'x-conversation-id': result.conversation_id },
    });
  },
});

export default api;
