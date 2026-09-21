import { useChat } from '@ai-sdk/react';
import { useEffect } from 'react';

import { api } from '@/utils/api';

import { agentChatRegistry, type AgentChatMessage } from '../chat-registry.js';
import { toAgentChatMessages } from '../utils.js';

export type { AgentChatMessage };

type UseAgentChatOptions = {
  /** 服务端会话 id；为空时使用草稿 Chat。 */
  conversationId: string | null;
};

/**
 * 管理当前会话的 AI SDK 聊天状态、历史加载和快捷提问。
 *
 * Chat 实例保存在会话级注册表中；当前会话由路由派生。
 * 新对话使用唯一草稿实例，首次请求由服务端创建真实会话。
 *
 * @param options 当前服务端会话 id。
 * @returns 聊天消息、状态和操作方法。
 */
export function useAgentChat({ conversationId }: UseAgentChatOptions) {
  const chatInstance = conversationId
    ? agentChatRegistry.getChat(conversationId)
    : agentChatRegistry.getDraftChat();
  const chat = useChat<AgentChatMessage>({
    chat: chatInstance,
  });

  useEffect(() => {
    if (
      !conversationId ||
      chat.status !== 'ready' ||
      !agentChatRegistry.shouldLoadMessages(conversationId)
    ) {
      return;
    }
    api('/agent/message-list', {
      conversation_id: conversationId,
      limit: [0, 100],
      with_count: false,
    })
      .then(({ list }) => {
        agentChatRegistry.setMessages(
          conversationId,
          toAgentChatMessages(list),
        );
      })
      .catch(() => {});
  }, [conversationId, chat.status]);

  /**
   * 发起快捷提问；未选中会话时直接使用唯一草稿 Chat。
   *
   * @param prompt 快捷提问文本。
   */
  function startPrompt(prompt: string) {
    void chat.sendMessage({
      text: prompt,
      metadata: { reasoning: false },
    });
  }

  return {
    messages: chat.messages,
    status: chat.status,
    error: chat.error,
    sendMessage: chat.sendMessage,
    stop: chat.stop,
    regenerate: chat.regenerate,
    startPrompt,
  };
}
