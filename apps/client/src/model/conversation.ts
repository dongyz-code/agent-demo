import { create } from 'zustand';

import type {
  AgentConversationStatus,
  AgentScenario,
} from '@repo/types';

/** 会话列表项；字段复用 @repo/types 的 Agent 原子类型，组装形状由客户端 store 定义。 */
export type Conversation = {
  id: string;
  /** 服务端会话 id；本地新建会话首次发送前为空。 */
  serverId?: string;
  title: string;
  scenario: AgentScenario;
  status: AgentConversationStatus;
  updatedAt: number;
};

type ConversationState = {
  /** 当前用户可见的会话列表。 */
  conversations: Conversation[];
  /** 当前选中的会话 id，null 表示未选中任何会话。 */
  currentId: string | null;
  /** 会话历史是否已完成首次服务端加载。 */
  conversationHistoryLoaded: boolean;
  /** 会话历史是否正在加载，用于避免并发重复请求。 */
  conversationHistoryLoading: boolean;
  /** 选中指定会话，不存在则忽略。 */
  selectConversation: (id: string) => void;
  /** 新建一条空会话并选中，返回新会话 id。 */
  createConversation: () => string;
  /** 用服务端历史记录替换会话列表，并标记历史已加载。 */
  setConversationHistory: (conversations: Conversation[]) => void;
  /** 更新会话历史加载状态。 */
  setConversationHistoryLoading: (loading: boolean) => void;
  /** 绑定服务端会话 id；首次请求由服务端创建会话后回传。 */
  linkConversationServerId: (
    conversationId: string,
    serverConversationId: string,
  ) => void;
  /** 删除会话并从列表移除；若删除的是当前会话则取消选中。 */
  removeConversation: (conversationId: string) => void;
  /** 更新会话标题；仅维护本地状态，服务端持久化由调用方处理。 */
  renameConversation: (conversationId: string, title: string) => void;
  /** 取消当前选中。 */
  clearCurrent: () => void;
};

export const useConversationModel = create<ConversationState>()((set, get) => ({
  conversations: [],
  currentId: null,
  conversationHistoryLoaded: false,
  conversationHistoryLoading: false,
  selectConversation: (id) => {
    if (!get().conversations.some((c) => c.id === id)) {
      return;
    }
    set({ currentId: id });
  },
  createConversation: () => {
    const id = `c-${Date.now()}`;
    const conversation: Conversation = {
      id,
      title: '新会话',
      scenario: 'chat',
      status: 'active',
      updatedAt: Date.now(),
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      currentId: id,
    }));
    return id;
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
  linkConversationServerId: (conversationId, serverConversationId) => {
    const state = get();
    const conversation = state.conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation || conversation.serverId === serverConversationId) {
      return;
    }
    set((current) => ({
      conversations: current.conversations.map((item) =>
        item.id === conversationId
          ? { ...item, serverId: serverConversationId }
          : item,
      ),
    }));
  },
  removeConversation: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.filter(
        (conversation) => conversation.id !== conversationId,
      ),
      currentId:
        state.currentId === conversationId ? null : state.currentId,
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
  clearCurrent: () => set({ currentId: null }),
}));
