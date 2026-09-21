import { create } from 'zustand';

import type { AgentConversationStatus, AgentScenario } from '@repo/types';

/** 会话列表项；字段复用 @repo/types 的 Agent 原子类型，组装形状由客户端 store 定义。 */
export type Conversation = {
  /** 服务端会话 id；路由参数和 Agent 接口共用该值。 */
  id: string;
  title: string;
  scenario: AgentScenario;
  status: AgentConversationStatus;
  /** 会话创建时间，用于侧边栏排序和时间分组。 */
  createdAt: number;
  /** 会话最近更新时间，仅表示业务更新，不用于会话排序。 */
  updatedAt: number;
};

type ConversationState = {
  /** 当前用户可见的会话列表。 */
  conversations: Conversation[];
  /** 会话历史是否已完成首次服务端加载。 */
  conversationHistoryLoaded: boolean;
  /** 会话历史是否正在加载，用于避免并发重复请求。 */
  conversationHistoryLoading: boolean;
  /** 首次请求由服务端创建会话后，写入真实会话记录。 */
  createConversationFromServer: (conversationId: string, title: string) => void;
  /** 用服务端历史记录替换会话列表，并标记历史已加载。 */
  setConversationHistory: (conversations: Conversation[]) => void;
  /** 更新会话历史加载状态。 */
  setConversationHistoryLoading: (loading: boolean) => void;
  /** 清空用户作用域的会话状态，用于退出登录或认证失效后避免跨用户泄漏。 */
  resetConversationState: () => void;
  /** 删除会话并从列表移除。 */
  removeConversation: (conversationId: string) => void;
  /** 更新会话标题；仅维护本地状态，服务端持久化由调用方处理。 */
  renameConversation: (conversationId: string, title: string) => void;
  /** 后台流式完成后刷新会话更新时间，用于保留最近业务更新信息。 */
  touchConversation: (conversationId: string) => void;
};

export const useConversationModel = create<ConversationState>()((set, get) => ({
  conversations: [],
  conversationHistoryLoaded: false,
  conversationHistoryLoading: false,
  createConversationFromServer: (conversationId, title) => {
    if (
      get().conversations.some(
        (conversation) => conversation.id === conversationId,
      )
    ) {
      return;
    }

    const conversation: Conversation = {
      id: conversationId,
      title,
      scenario: 'chat',
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    }));
  },
  setConversationHistory: (conversations) => {
    set({
      conversations,
      conversationHistoryLoaded: true,
      conversationHistoryLoading: false,
    });
  },
  setConversationHistoryLoading: (loading) => {
    set({ conversationHistoryLoading: loading });
  },
  resetConversationState: () => {
    set({
      conversations: [],
      conversationHistoryLoaded: false,
      conversationHistoryLoading: false,
    });
  },
  removeConversation: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      ),
    }));
  },
  renameConversation: (conversationId, title) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, title, updatedAt: Date.now() }
          : conversation,
      ),
    }));
  },
  touchConversation: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, updatedAt: Date.now() }
          : conversation,
      ),
    }));
  },
}));
