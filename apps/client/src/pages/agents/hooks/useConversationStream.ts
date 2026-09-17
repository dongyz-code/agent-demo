import type { AgentChatStreamEvent } from '@/utils/agent-chat';

import { selectCurrentIsStreaming, useConversationModel } from '@/model';
import { streamAgentChat } from '@/utils/agent-chat';

/**
 * 消费 chat 路由流并写入全局会话模型，切换会话或离开页面都不中断请求。
 *
 * @returns 当前会话流状态与发送消息方法。
 */
export function useConversationStream() {
  const appendMessage = useConversationModel((state) => state.appendMessage);
  const linkConversationServerId = useConversationModel(
    (state) => state.linkConversationServerId,
  );
  const startMessageStream = useConversationModel(
    (state) => state.startMessageStream,
  );
  const appendMessagePart = useConversationModel(
    (state) => state.appendMessagePart,
  );
  const finishMessageStream = useConversationModel(
    (state) => state.finishMessageStream,
  );
  const isStreaming = useConversationModel(selectCurrentIsStreaming);

  /**
   * 写入用户消息并启动助手流式回复。
   *
   * @param conversationId 本地会话 id。
   * @param text 用户输入文本。
   * @returns 是否成功创建流；失败时调用方应保留输入内容。
   */
  function sendMessage(conversationId: string | null, text: string): boolean {
    const content = text.trim();
    if (!conversationId || content.length === 0 || isStreaming) {
      return false;
    }

    const conversation = useConversationModel
      .getState()
      .conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      return false;
    }

    const userMessage: Parameters<typeof appendMessage>[1] = {
      id: `m-${crypto.randomUUID()}`,
      role: 'user',
      status: 'active',
      parts: [{ type: 'text', text: content }],
    };
    appendMessage(conversationId, userMessage);

    const assistantMessage: Parameters<typeof appendMessage>[1] = {
      id: `m-${crypto.randomUUID()}`,
      role: 'assistant',
      status: 'partial',
      parts: [],
    };
    if (!startMessageStream(conversationId, assistantMessage)) {
      return false;
    }

    void consumeChatStream({
      conversationId,
      serverConversationId: conversation.serverId,
      messageId: assistantMessage.id,
      message: content,
    });
    return true;
  }

  /**
   * 请求 chat 路由并把流事件写入指定会话。
   *
   * @param input 流定位信息与用户消息。
   */
  async function consumeChatStream(input: {
    conversationId: string;
    serverConversationId?: string;
    messageId: string;
    message: string;
  }) {
    try {
      await streamAgentChat({
        message: input.message,
        conversationId: input.serverConversationId,
        onConversationId: (serverConversationId) => {
          linkConversationServerId(input.conversationId, serverConversationId);
        },
        onEvent: (event) => {
          writeStreamEvent(input.conversationId, input.messageId, event);
        },
      });
      finishMessageStream(input.conversationId, input.messageId, 'active');
    } catch {
      finishMessageStream(input.conversationId, input.messageId, 'error');
    }
  }

  /**
   * 把单个路由流事件转换为模型写入操作。
   *
   * @param conversationId 本地会话 id。
   * @param messageId 助手消息 id。
   * @param event 路由流事件。
   */
  function writeStreamEvent(
    conversationId: string,
    messageId: string,
    event: AgentChatStreamEvent,
  ) {
    switch (event.type) {
      case 'text-delta':
        appendMessagePart(conversationId, messageId, {
          type: 'text',
          text: event.delta,
        });
        return;
      case 'tool-call':
        appendMessagePart(conversationId, messageId, {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
        });
        return;
      case 'tool-result':
        appendMessagePart(conversationId, messageId, {
          type: 'tool-result',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
          output: event.output,
          isError: event.isError,
        });
        return;
      case 'finish':
        finishMessageStream(
          conversationId,
          messageId,
          event.finishReason === 'error' ? 'error' : 'active',
        );
        return;
      case 'abort':
        finishMessageStream(conversationId, messageId, 'partial');
        return;
      case 'error':
        finishMessageStream(conversationId, messageId, 'error');
        return;
    }
  }

  return { isStreaming, sendMessage };
}
