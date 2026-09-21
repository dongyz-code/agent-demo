import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';

import { API_BASE } from '@/constants/env';
import {
  getSessionEpoch,
  handleUnauthorized,
  useConversationModel,
} from '@/model';
import { router, routerGo } from '@/router';

/** 客户端附加在用户消息上的请求选项，用于重新生成时恢复思考模式。 */
export type AgentChatMessageMetadata = {
  /** 本次用户请求是否开启思考输出。 */
  reasoning?: boolean;
};

/** useChat 与会话实例池统一使用的消息形状。 */
export type AgentChatMessage = UIMessage<AgentChatMessageMetadata>;

/** Chat 与服务端会话的绑定关系；草稿态没有会话 id。 */
type ChatBinding = {
  /** 服务端会话 id；首次响应后写入。 */
  conversationId?: string;
};

/**
 * 管理草稿 Chat 和会话级 Chat 实例池。
 *
 * Chat 实例与视图生命周期解耦：首次访问会话时懒创建并缓存，
 * 切换视图不会销毁实例，从而保持后台流式请求继续执行。
 * 新对话没有业务 id；服务端返回会话 id 后，草稿实例升级为真实会话实例，
 * 并重新创建下一个草稿。
 */
export class AgentChatRegistry {
  private readonly chats = new Map<string, Chat<AgentChatMessage>>();
  private draftChat: Chat<AgentChatMessage> | undefined;
  private draftBinding: ChatBinding | undefined;
  private readonly loadedMessageConversationIds = new Set<string>();

  /**
   * 获取或创建会话级 Chat 实例。
   *
   * @param conversationId 服务端会话 id。
   * @returns 与会话同生命周期的 Chat 实例；切换会话不会销毁它。
   */
  getChat(conversationId: string) {
    const existingChat = this.chats.get(conversationId);
    if (existingChat) {
      return existingChat;
    }

    const chat = this.createChat({ conversationId });
    this.chats.set(conversationId, chat);
    return chat;
  }

  /**
   * 获取唯一的草稿 Chat。
   *
   * @returns 草稿 Chat；首次发送前不携带任何会话 id。
   */
  getDraftChat() {
    if (this.draftChat) {
      return this.draftChat;
    }

    this.draftBinding = {};
    this.draftChat = this.createChat(this.draftBinding);
    return this.draftChat;
  }

  /**
   * 清空已失败或已结束的草稿消息。
   *
   * 流式请求进行中时不清理，避免用户点击“新建会话”时中断后台响应。
   */
  resetDraft() {
    const chat = this.draftChat;
    if (!chat || chat.status === 'submitted' || chat.status === 'streaming') {
      return;
    }

    chat.clearError();
    chat.messages = [];
  }

  /**
   * 判断会话历史是否需要从服务端加载。
   *
   * @param conversationId 服务端会话 id。
   * @returns 需要加载且本地没有已展示消息时返回 true。
   */
  shouldLoadMessages(conversationId: string) {
    if (this.loadedMessageConversationIds.has(conversationId)) {
      return false;
    }

    const chat = this.chats.get(conversationId);
    if (!chat || chat.messages.length === 0) {
      return true;
    }

    this.loadedMessageConversationIds.add(conversationId);
    return false;
  }

  /**
   * 写入服务端历史消息。
   *
   * @param conversationId 会话 id。
   * @param messages 服务端转换后的消息列表。
   * 写入时会跳过流式中的 Chat，避免覆盖实时输出。
   */
  setMessages(conversationId: string, messages: AgentChatMessage[]) {
    const chat = this.chats.get(conversationId);
    if (!chat || chat.status !== 'ready') {
      return;
    }
    chat.messages = messages;
    this.loadedMessageConversationIds.add(conversationId);
  }

  /**
   * 停止并移除单个会话的 Chat 实例。
   *
   * @param conversationId 会话 id。
   */
  dispose(conversationId: string) {
    const chat = this.chats.get(conversationId);
    if (!chat) {
      return;
    }
    this.chats.delete(conversationId);
    this.loadedMessageConversationIds.delete(conversationId);
    void chat.stop();
  }

  /**
   * 停止并清空全部会话 Chat 实例。
   *
   * 用于退出登录或认证失效时释放请求与消息内存。
   */
  clear() {
    const chats = [...this.chats.values()];
    if (this.draftChat) {
      chats.push(this.draftChat);
    }
    this.chats.clear();
    this.loadedMessageConversationIds.clear();
    this.draftChat = undefined;
    this.draftBinding = undefined;
    for (const chat of chats) {
      void chat.stop();
    }
  }

  /**
   * 创建与会话绑定的 Chat 实例。
   *
   * @param binding Chat 与会话的绑定关系。
   * @returns 独立状态容器；完成后同步会话更新时间。
   */
  private createChat(binding: ChatBinding) {
    return new Chat<AgentChatMessage>({
      id: binding.conversationId ?? crypto.randomUUID(),
      transport: this.createTransport(binding),
      onFinish() {
        if (binding.conversationId) {
          useConversationModel
            .getState()
            .touchConversation(binding.conversationId);
        }
      },
    });
  }

  /**
   * 创建只服务于单个会话的 transport。
   *
   * @param binding Chat 与会话的绑定关系。
   * @returns 独立 transport；并发请求不会共享可变的当前会话状态。
   */
  private createTransport(binding: ChatBinding) {
    return new DefaultChatTransport<AgentChatMessage>({
      api: `${API_BASE}/api/agent/chat`,
      credentials: 'include',
      prepareSendMessagesRequest({ messages, body, trigger }) {
        const lastMessage = messages.at(-1);
        const message = extractText(lastMessage);
        const reasoning = lastMessage?.metadata?.reasoning ?? false;

        return {
          body: {
            ...body,
            conversation_id: binding.conversationId,
            message,
            reasoning,
            regenerate: trigger === 'regenerate-message',
          },
        };
      },
      fetch: async (input, init) => {
        const response = await fetch(input, init);

        if (response.status === 401) {
          this.clear();
          void handleUnauthorized(getSessionEpoch());
        }

        if (!response.ok) {
          throw new Error(`chat 请求失败：${response.status}`);
        }

        const conversationId = response.headers.get('x-conversation-id');
        if (conversationId && !binding.conversationId) {
          this.promoteDraft(conversationId);
        }
        return response;
      },
    });
  }

  /**
   * 将草稿 Chat 升级为真实会话实例。
   *
   * @param serverConversationId 服务端返回的会话 id。
   */
  private promoteDraft(serverConversationId: string) {
    const chat = this.draftChat;
    const binding = this.draftBinding;
    if (!chat || !binding) {
      return;
    }

    binding.conversationId = serverConversationId;
    this.chats.set(serverConversationId, chat);
    this.loadedMessageConversationIds.add(serverConversationId);
    this.draftChat = undefined;
    this.draftBinding = undefined;

    const initialMessage = extractText(
      chat.messages.find(({ role }) => role === 'user'),
    );
    useConversationModel
      .getState()
      .createConversationFromServer(
        serverConversationId,
        initialMessage?.slice(0, 100) ?? '新会话',
      );
    this.getDraftChat();

    if (router.state.location.pathname === '/agents') {
      void routerGo('agents', {
        params: { conversationId: serverConversationId },
        replace: true,
      }).catch(() => {
        // 路由失败不能中断已经开始的流式响应。
      });
    }
  }
}

/**
 * 提取消息内的用户可见文本。
 *
 * @param message 待提取的消息。
 * @returns 拼接后的文本；无文本时返回 undefined。
 */
function extractText(message: AgentChatMessage | undefined) {
  if (!message) {
    return undefined;
  }

  return message.parts
    .filter((part): part is { type: 'text'; text: string } => {
      return part.type === 'text';
    })
    .map((part) => part.text)
    .join('\n');
}

/** Agent 会话实例池单例；随客户端模块生命周期存在。 */
export const agentChatRegistry = new AgentChatRegistry();
