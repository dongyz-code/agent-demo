import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';

import { API_BASE } from '@/constants/env';
import {
  getSessionEpoch,
  handleUnauthorized,
  useConversationModel,
} from '@/model';

/** useChat 使用的消息形状；历史消息和流式消息统一使用 AI SDK UIMessage。 */
export type AgentChatMessage = UIMessage;

type UseAgentChatOptions = {
  /** 本地会话 id；切换后 useChat 会重建聊天状态。 */
  conversationId: string;
  /** 服务端历史消息；异步加载完成后由 hook 同步给 useChat。 */
  initialMessages: AgentChatMessage[];
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
    prepareSendMessagesRequest({ id, messages }) {
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
          conversation_id: conversation?.serverId,
          message,
        },
      };
    },
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (response.status === 401) {
        void handleUnauthorized(getSessionEpoch());
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
 * 使用 AI SDK useChat 管理当前会话的消息、流式输出和终止状态。
 *
 * @param options 本地会话 id 与历史消息。
 * @returns useChat helpers，消息渲染和输入区直接消费。
 */
export function useAgentChat({
  conversationId,
  initialMessages,
}: UseAgentChatOptions) {
  const linkConversationServerId = useConversationModel(
    (state) => state.linkConversationServerId,
  );
  const transport = useMemo(
    () => createAgentChatTransport(linkConversationServerId),
    [linkConversationServerId],
  );
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
    return () => {
      void chatRef.current.stop();
    };
  }, []);

  return chat;
}
