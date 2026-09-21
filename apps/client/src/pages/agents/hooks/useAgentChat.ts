import { useChat } from '@ai-sdk/react';
import { useEffect } from 'react';

import { api } from '@/utils/api';

import {
  agentChatRegistry,
  type AgentChatMessage,
} from '../chat-registry.js';
import { toAgentChatMessages } from '../utils.js';

import type { Conversation } from '@/model';

export type { AgentChatMessage };

type UseAgentChatOptions = {
  /** 当前会话；为空时使用稳定占位 Chat。 */
  conversation: Conversation | null;
};

/**
 * 管理当前会话的 AI SDK 聊天状态、历史加载和快捷提问。
 *
 * Chat 实例保存在会话级注册表中；当前会话由路由派生。
 * 新对话使用唯一草稿实例，首次请求由服务端创建真实会话。
 *
 * @param options 当前会话。
 * @returns 聊天消息、状态和操作方法。
 */
export function useAgentChat({
  conversation,
}: UseAgentChatOptions) {
  const chatInstance = conversation
    ? agentChatRegistry.getChat(conversation)
    : agentChatRegistry.getDraftChat();
  const chat = useChat<AgentChatMessage>({
    chat: chatInstance,
  });

  useEffect(() => {
    if (
      !conversation ||
      chat.status !== 'ready' ||
      !agentChatRegistry.shouldLoadMessages(conversation.id)
    ) {
      return;
    }
    api('/agent/message-list', {
      conversation_id: conversation.id,
      limit: [0, 100],
      with_count: false,
      })
      .then(({ list }) => {
        agentChatRegistry.setMessages(
          conversation.id,
          toAgentChatMessages(list),
        );
      })
      .catch(() => {});
  }, [conversation, chat.status]);

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
