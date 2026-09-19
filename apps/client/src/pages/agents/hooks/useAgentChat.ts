import { useChat } from '@ai-sdk/react';
import { useParams } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { routerGo } from '@/router';
import { api } from '@/utils/api';

import {
  getAgentChat,
  getEmptyAgentChat,
  setAgentChatMessages,
  type AgentChatMessage,
} from '../chat-registry.js';
import { toAgentChatMessages } from '../utils.js';

import type { Conversation } from '@/model';

export type { AgentChatMessage };

type UseAgentChatOptions = {
  /** 当前会话；为空时使用稳定占位 Chat。 */
  conversation: Conversation | null;
  /** 创建本地会话的方法，用于空状态快捷提问。 */
  createConversation: () => string;
};

/**
 * 管理当前会话的 AI SDK 聊天状态、历史加载和快捷提问。
 *
 * Chat 实例保存在会话级注册表中；切换会话只改变当前渲染对象，
 * 不会停止其他会话正在进行的流式请求。
 *
 * @param options 当前会话与创建会话方法。
 * @returns 聊天消息、状态和操作方法。
 */
export function useAgentChat({
  conversation,
  createConversation,
}: UseAgentChatOptions) {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const requestedMessageIdsRef = useRef(new Set<string>());
  const routeParams = useParams({ strict: false });
  const routeConversationId = routeParams.conversationId;

  const chatInstance = conversation
    ? getAgentChat(conversation)
    : getEmptyAgentChat();
  const chat = useChat<AgentChatMessage>({
    chat: chatInstance,
  });

  useEffect(() => {
    if (
      !conversation?.serverId ||
      routeConversationId === conversation.serverId
    ) {
      return;
    }

    void routerGo('agents', {
      params: { conversationId: conversation.serverId },
      replace: true,
    });
  }, [conversation?.serverId, routeConversationId]);

  useEffect(() => {
    if (
      !conversation?.serverId ||
      requestedMessageIdsRef.current.has(conversation.id) ||
      chat.status !== 'ready'
    ) {
      return;
    }

    requestedMessageIdsRef.current.add(conversation.id);
    void api('/agent/message-list', {
      conversation_id: conversation.serverId,
      limit: [0, 100],
      with_count: false,
    })
      .then(({ list }) => {
        const applied = setAgentChatMessages(
          conversation.id,
          toAgentChatMessages(list),
        );
        if (!applied) {
          requestedMessageIdsRef.current.delete(conversation.id);
        }
      })
      .catch(() => {
        requestedMessageIdsRef.current.delete(conversation.id);
      });
  }, [conversation, chat.status]);

  useEffect(() => {
    if (!conversation || pendingPrompt === null || chat.status !== 'ready') {
      return;
    }
    setPendingPrompt(null);
    void chat.sendMessage({ text: pendingPrompt });
  }, [conversation, pendingPrompt, chat.status, chat.sendMessage]);

  /**
   * 发起快捷提问；未选中会话时先创建本地会话，待 hook 重建后再发送。
   *
   * @param prompt 快捷提问文本。
   */
  function startPrompt(prompt: string) {
    if (!conversation) {
      createConversation();
      setPendingPrompt(prompt);
      return;
    }
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
