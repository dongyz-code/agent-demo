import { create } from 'zustand';

import type {
  AgentConversationStatus,
  AgentMessagePart,
  AgentMessageRole,
  AgentMessageStatus,
  AgentScenario,
} from '@repo/types';

/** 会话列表项；字段复用 @repo/types 的 Agent 原子类型，组装形状由客户端 store 定义。 */
export type Conversation = {
  id: string;
  title: string;
  scenario: AgentScenario;
  status: AgentConversationStatus;
  updatedAt: number;
};

/** 单条对话消息；parts 复用 @repo/types 的 AgentMessagePart 判别联合。 */
export type ConversationMessage = {
  id: string;
  role: AgentMessageRole;
  status: AgentMessageStatus;
  parts: AgentMessagePart[];
};

/** 按会话 id 索引的消息表，避免在 store 里维护嵌套数组。 */
type MessageMap = Record<string, ConversationMessage[]>;

type ConversationState = {
  /** 当前用户可见的会话列表。 */
  conversations: Conversation[];
  /** 当前选中的会话 id，null 表示未选中任何会话。 */
  currentId: string | null;
  /** 按会话 id 索引的消息表；组件通过 currentId 取当前会话消息。 */
  messageMap: MessageMap;
  /** 选中指定会话，不存在则忽略。 */
  selectConversation: (id: string) => void;
  /** 新建一条空会话并选中，返回新会话 id。 */
  createConversation: () => string;
  /** 向指定会话追加一条消息，并刷新该会话的更新时间。 */
  appendMessage: (conversationId: string, message: ConversationMessage) => void;
  /** 取消当前选中。 */
  clearCurrent: () => void;
};

/** 空消息数组常量，避免选择器返回新引用导致重渲染。 */
const emptyMessages: ConversationMessage[] = [];

/** 初始 mock 会话列表，后续接真接口时替换为服务端拉取。 */
const mockConversations: Conversation[] = [
  {
    id: 'c-1',
    title: 'SQL 数据探查',
    scenario: 'sql',
    status: 'active',
    updatedAt: Date.now() - 3_600_000,
  },
  {
    id: 'c-2',
    title: '通用对话',
    scenario: 'chat',
    status: 'active',
    updatedAt: Date.now() - 7_200_000,
  },
  {
    id: 'c-3',
    title: '报表口径确认',
    scenario: 'chat',
    status: 'archived',
    updatedAt: Date.now() - 86_400_000,
  },
];

/** 初始 mock 消息，仅用于前端骨架展示，不接真接口。 */
const mockMessages: MessageMap = {
  'c-1': [
    {
      id: 'm-1',
      role: 'user',
      status: 'active',
      parts: [{ type: 'text', text: '帮我看下 orders 表最近的量' }],
    },
    {
      id: 'm-2',
      role: 'assistant',
      status: 'active',
      parts: [
        {
          type: 'text',
          text: '已查询 orders 表，最近 7 天共 1,284 行，环比上升 12%。需要按渠道拆分吗？',
        },
      ],
    },
  ],
  'c-2': [
    {
      id: 'm-3',
      role: 'user',
      status: 'active',
      parts: [{ type: 'text', text: '你能做什么？' }],
    },
    {
      id: 'm-4',
      role: 'assistant',
      status: 'active',
      parts: [
        {
          type: 'text',
          text: '我可以帮你查询数据、编写 SQL、编排任务。请告诉我你想做什么。',
        },
      ],
    },
  ],
  'c-3': [],
};

export const useConversationModel = create<ConversationState>()((set, get) => ({
  conversations: mockConversations,
  currentId: null,
  messageMap: mockMessages,
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
      messageMap: { ...state.messageMap, [id]: [] },
    }));
    return id;
  },
  appendMessage: (conversationId, message) => {
    set((state) => {
      const prev = state.messageMap[conversationId] ?? [];
      return {
        messageMap: {
          ...state.messageMap,
          [conversationId]: [...prev, message],
        },
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, updatedAt: Date.now() } : c,
        ),
      };
    });
  },
  clearCurrent: () => set({ currentId: null }),
}));

/** 选择当前会话消息的辅助选择器，未选中时返回稳定空数组。 */
export function selectCurrentMessages(
  state: ConversationState,
): ConversationMessage[] {
  if (!state.currentId) {
    return emptyMessages;
  }
  return state.messageMap[state.currentId] ?? emptyMessages;
}
