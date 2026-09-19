import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

import { API_BASE } from '@/constants/env';
import {
  getSessionEpoch,
  handleUnauthorized,
  useConversationModel,
} from '@/model';

import type { Conversation } from '@/model';

/** 客户端附加在用户消息上的请求选项，用于重新生成时恢复思考模式。 */
export type AgentChatMessageMetadata = {
  /** 本次用户请求是否开启思考输出。 */
  reasoning?: boolean;
};

/** useChat 与会话实例池统一使用的消息形状。 */
export type AgentChatMessage = UIMessage<AgentChatMessageMetadata>;

const agentChats = new Map<string, Chat<AgentChatMessage>>();

/**
 * 创建只服务于单个会话的 transport。
 *
 * @param conversationId 本地会话 id。
 * @returns 独立 transport；并发请求不会共享可变的当前会话状态。
 */
function createAgentChatTransport(conversationId: string) {
  return new DefaultChatTransport<AgentChatMessage>({
    api: `${API_BASE}/api/agent/chat`,
    credentials: 'include',
    prepareSendMessagesRequest({ messages, body, trigger }) {
      const lastMessage = messages.at(-1);
      const message = lastMessage?.parts
        .filter((part): part is { type: 'text'; text: string } => {
          return part.type === 'text';
        })
        .map((part) => part.text)
        .join('\n');
      const conversation = useConversationModel
        .getState()
        .conversations.find((item) => item.id === conversationId);

      const reasoning = lastMessage?.metadata?.reasoning ?? false;

      return {
        body: {
          ...body,
          conversation_id: conversation?.serverId,
          message,
          reasoning,
          regenerate: trigger === 'regenerate-message',
        },
      };
    },
    fetch: async (input, init) => {
      const response = await fetch(input, init);

      if (response.status === 401) {
        clearAgentChatRegistry();
        void handleUnauthorized(getSessionEpoch());
      }
      if (!response.ok) {
        throw new Error(`chat 请求失败：${response.status}`);
      }

      const serverConversationId = response.headers.get('x-conversation-id');
      if (serverConversationId) {
        useConversationModel
          .getState()
          .linkConversationServerId(conversationId, serverConversationId);
      }
      return response;
    },
  });
}

/**
 * 获取或创建会话级 Chat 实例。
 *
 * @param conversation 当前会话。
 * @returns 与会话同生命周期的 Chat 实例；切换会话不会销毁它。
 */
export function getAgentChat(conversation: Conversation) {
  const existingChat = agentChats.get(conversation.id);
  if (existingChat) {
    return existingChat;
  }

  const chat = new Chat<AgentChatMessage>({
    id: conversation.id,
    transport: createAgentChatTransport(conversation.id),
    onFinish() {
      useConversationModel.getState().touchConversation(conversation.id);
    },
  });
  agentChats.set(conversation.id, chat);
  return chat;
}

/**
 * 获取未选中会话时使用的占位 Chat。
 *
 * @returns 稳定的空 Chat，保证 useChat 调用不依赖条件分支。
 */
export function getEmptyAgentChat() {
  return getAgentChat({
    id: 'no-conversation',
    title: '新会话',
    scenario: 'chat',
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * 写入服务端历史消息。
 *
 * @param conversationId 本地会话 id。
 * @param messages 服务端转换后的消息列表。
 * @returns 是否写入成功；流式中会跳过，避免覆盖实时输出。
 */
export function setAgentChatMessages(
  conversationId: string,
  messages: AgentChatMessage[],
) {
  const chat = agentChats.get(conversationId);
  if (!chat || chat.status !== 'ready') {
    return false;
  }
  chat.messages = messages;
  return true;
}

/**
 * 停止并移除单个会话的 Chat 实例。
 *
 * @param conversationId 本地会话 id。
 */
export function disposeAgentChat(conversationId: string) {
  const chat = agentChats.get(conversationId);
  if (!chat) {
    return;
  }
  agentChats.delete(conversationId);
  void chat.stop();
}

/** 停止并清空全部会话 Chat 实例，用于退出登录或认证失效。 */
export function clearAgentChatRegistry() {
  const chats = [...agentChats.values()];
  agentChats.clear();
  for (const chat of chats) {
    void chat.stop();
  }
}
