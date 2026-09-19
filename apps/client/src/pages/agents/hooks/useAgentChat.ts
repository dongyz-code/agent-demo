import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { API_BASE } from '@/constants/env';
import {
  getSessionEpoch,
  handleUnauthorized,
  useConversationModel,
} from '@/model';
import { api } from '@/utils/api';
import { emptyChatMessages, toAgentChatMessage } from '../utils.js';

import type { Conversation } from '@/model';

/** useChat 使用的消息形状；历史消息和流式消息统一使用 AI SDK UIMessage。 */
export type AgentChatMessage = UIMessage;

type UseAgentChatOptions = {
  /** 当前会话；为空时使用稳定占位 id，避免复用上一会话状态。 */
  conversation: Conversation | null;
  /** 创建本地会话的方法，用于空状态快捷提问。 */
  createConversation: () => string;
};

/**
 * 创建对接现有 chat 接口的 AI SDK transport。
 *
 * @param linkConversationServerId 绑定服务端会话 id 的方法。
 * @returns 保留现有请求体、cookie 认证和响应头解析的 transport。
 */
function createAgentChatTransport(
  linkConversationServerId: (conversationId: string, serverId: string) => void,
) {
  let activeConversationId: string | null = null;

  return new DefaultChatTransport<AgentChatMessage>({
    api: `${API_BASE}/api/agent/chat`,
    credentials: 'include',
    prepareSendMessagesRequest({ id, messages, body }) {
      activeConversationId = id;
      const lastMessage = messages.at(-1);
      const message = lastMessage?.parts
        .filter((part): part is { type: 'text'; text: string } => {
          return part.type === 'text';
        })
        .map((part) => part.text)
        .join('\n');
      const conversation = useConversationModel
        .getState()
        .conversations.find((item) => item.id === id);

      return {
        body: {
          ...body,
          conversation_id: conversation?.serverId,
          message,
        },
      };
    },
    fetch: async (input, init) => {
      const response = await fetch(input, init);

      if (response.status === 401) {
        handleUnauthorized(getSessionEpoch());
      }
      if (!response.ok) {
        throw new Error(`chat 请求失败：${response.status}`);
      }

      const serverConversationId = response.headers.get('x-conversation-id');
      if (serverConversationId && activeConversationId) {
        linkConversationServerId(activeConversationId, serverConversationId);
      }

      return response;
    },
  });
}

/**
 * 管理当前会话的 AI SDK 聊天状态、历史加载和快捷提问。
 *
 * @param options 当前会话与创建会话方法。
 * @returns 聊天消息、状态和操作方法。
 */
export function useAgentChat({
  conversation,
  createConversation,
}: UseAgentChatOptions) {
  const linkConversationServerId = useConversationModel(
    (state) => state.linkConversationServerId,
  );
  const transport = useMemo(
    () => createAgentChatTransport(linkConversationServerId),
    [linkConversationServerId],
  );
  const [historyMessages, setHistoryMessages] = useState<
    Record<string, AgentChatMessage[]>
  >({});
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const requestedMessageIdsRef = useRef(new Set<string>());
  const localConversationIdsRef = useRef(new Set<string>());

  const conversationId = conversation?.id ?? 'no-conversation';
  const initialMessages = conversation
    ? (historyMessages[conversation.id] ?? emptyChatMessages)
    : emptyChatMessages;
  const chat = useChat<AgentChatMessage>({
    id: conversationId,
    transport,
    messages: initialMessages,
  });
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const setMessages = chat.setMessages;

  useEffect(() => {
    setMessages(initialMessages);
  }, [setMessages, initialMessages]);

  useEffect(() => {
    if (conversation && !conversation.serverId) {
      localConversationIdsRef.current.add(conversation.id);
    }
  }, [conversation]);

  useEffect(() => {
    if (
      !conversation?.serverId ||
      requestedMessageIdsRef.current.has(conversation.id) ||
      localConversationIdsRef.current.has(conversation.id)
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
        setHistoryMessages((state) => ({
          ...state,
          [conversation.id]: list.map(toAgentChatMessage),
        }));
      })
      .catch(() => {
        requestedMessageIdsRef.current.delete(conversation.id);
      });
  }, [conversation]);

  useEffect(() => {
    if (!conversation || pendingPrompt === null || chat.status !== 'ready') {
      return;
    }
    setPendingPrompt(null);
    void chat.sendMessage({ text: pendingPrompt });
  }, [conversation, pendingPrompt, chat.status, chat.sendMessage]);

  useEffect(() => {
    return () => {
      void chatRef.current.stop();
    };
  }, []);

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
    void chat.sendMessage({ text: prompt });
  }

  return {
    messages: chat.messages,
    status: chat.status,
    sendMessage: chat.sendMessage,
    stop: chat.stop,
    regenerate: chat.regenerate,
    startPrompt,
  };
}
