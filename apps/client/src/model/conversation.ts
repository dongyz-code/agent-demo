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
  /** 服务端会话 id；本地新建会话首次发送前为空。 */
  serverId?: string;
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

/** 流式消息结束后的状态；partial 用于网络中断或用户中止后的部分输出。 */
type ConversationMessageFinalStatus = AgentMessageStatus;

/** 单个进行中的流式输出；终态由消息 status 承载，流记录不随消息持久化。 */
type ConversationStream = {
  /** 正在写入的 assistant 消息 id。 */
  messageId: string;
  /** 流开始时间，用于排查慢响应。 */
  startedAt: number;
  /** 最近一次收到分片或终态的时间。 */
  updatedAt: number;
};

/** 按会话 id 索引的流列表，允许同一会话并行多个响应。 */
type ConversationStreamMap = Record<string, ConversationStream[]>;

type ConversationState = {
  /** 当前用户可见的会话列表。 */
  conversations: Conversation[];
  /** 当前选中的会话 id，null 表示未选中任何会话。 */
  currentId: string | null;
  /** 按会话 id 索引的消息表；组件通过 currentId 取当前会话消息。 */
  messageMap: MessageMap;
  /** 按会话 id 索引的进行中流；切换 currentId 不影响流继续写入。 */
  streamMap: ConversationStreamMap;
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
  /** 用服务端历史记录替换指定会话的消息列表。 */
  setConversationMessages: (
    conversationId: string,
    messages: ConversationMessage[],
  ) => void;
  /** 向指定会话追加一条消息，并刷新该会话的更新时间。 */
  appendMessage: (conversationId: string, message: ConversationMessage) => void;
  /** 绑定服务端会话 id；首次请求由服务端创建会话后回传。 */
  linkConversationServerId: (
    conversationId: string,
    serverConversationId: string,
  ) => void;
  /** 创建流式 assistant 消息并登记流状态；会话或消息已存在时返回 false。 */
  startMessageStream: (
    conversationId: string,
    message: ConversationMessage,
  ) => boolean;
  /** 向指定会话的指定消息追加内容分片；连续 text 分片会合并到同一段。 */
  appendMessagePart: (
    conversationId: string,
    messageId: string,
    part: AgentMessagePart,
  ) => void;
  /** 结束流式消息，写入终态并移除流记录；partial 表示中断的部分输出。 */
  finishMessageStream: (
    conversationId: string,
    messageId: string,
    status: ConversationMessageFinalStatus,
  ) => void;
  /** 取消当前选中。 */
  clearCurrent: () => void;
};

/** 空消息数组常量，避免选择器返回新引用导致重渲染。 */
const emptyMessages: ConversationMessage[] = [];

/** 空流数组常量，避免选择器为无流会话返回新引用。 */
const emptyStreams: ConversationStream[] = [];

/**
 * 合并消息内容分片；连续文本分片写入同一段，避免逐 token 产生大量 parts。
 *
 * @param parts 消息已有分片。
 * @param part 新到达的分片。
 * @returns 合并后的新分片数组。
 */
function mergeMessagePart(
  parts: AgentMessagePart[],
  part: AgentMessagePart,
): AgentMessagePart[] {
  if (part.type !== 'text') {
    return [...parts, part];
  }
  const lastPart = parts.at(-1);
  if (lastPart?.type !== 'text') {
    return [...parts, part];
  }
  return [
    ...parts.slice(0, -1),
    { type: 'text', text: `${lastPart.text}${part.text}` },
  ];
}

/**
 * 刷新会话列表时间，供消息追加和流的开始、结束复用。
 *
 * @param conversations 会话列表。
 * @param conversationId 要刷新的会话 id。
 * @returns 更新后的会话列表。
 */
function touchConversation(
  conversations: Conversation[],
  conversationId: string,
): Conversation[] {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? { ...conversation, updatedAt: Date.now() }
      : conversation,
  );
}

export const useConversationModel = create<ConversationState>()((set, get) => ({
  conversations: [],
  currentId: null,
  messageMap: {},
  streamMap: {},
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
      messageMap: { ...state.messageMap, [id]: [] },
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
  setConversationMessages: (conversationId, messages) => {
    set((state) => ({
      messageMap: {
        ...state.messageMap,
        [conversationId]: messages,
      },
    }));
  },
  appendMessage: (conversationId, message) => {
    set((state) => {
      const prev = state.messageMap[conversationId] ?? [];
      return {
        messageMap: {
          ...state.messageMap,
          [conversationId]: [...prev, message],
        },
        conversations: touchConversation(state.conversations, conversationId),
      };
    });
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
  startMessageStream: (conversationId, message) => {
    const state = get();
    if (message.role !== 'assistant' || message.status !== 'partial') {
      return false;
    }
    const conversationExists = state.conversations.some(
      (conversation) => conversation.id === conversationId,
    );
    const messageExists = (state.messageMap[conversationId] ?? []).some(
      (item) => item.id === message.id,
    );
    if (!conversationExists || messageExists) {
      return false;
    }
    set((current) => ({
      messageMap: {
        ...current.messageMap,
        [conversationId]: [
          ...(current.messageMap[conversationId] ?? []),
          message,
        ],
      },
      streamMap: {
        ...current.streamMap,
        [conversationId]: [
          ...(current.streamMap[conversationId] ?? []),
          {
            messageId: message.id,
            startedAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      },
      conversations: touchConversation(current.conversations, conversationId),
    }));
    return true;
  },
  appendMessagePart: (conversationId, messageId, part) => {
    const currentState = get();
    const currentMessages = currentState.messageMap[conversationId] ?? [];
    const streams = currentState.streamMap[conversationId] ?? [];
    const hasMessage = currentMessages.some(
      (message) => message.id === messageId,
    );
    const hasStream = streams.some((stream) => stream.messageId === messageId);
    if (!hasMessage || !hasStream) {
      return;
    }

    set((state) => {
      const currentMessages = state.messageMap[conversationId] ?? [];
      const currentStreams = state.streamMap[conversationId] ?? [];
      const nextMessages = currentMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              parts: mergeMessagePart(message.parts, part),
            }
          : message,
      );
      const nextStreams = currentStreams.map((stream) =>
        stream.messageId === messageId
          ? { ...stream, updatedAt: Date.now() }
          : stream,
      );
      return {
        messageMap: {
          ...state.messageMap,
          [conversationId]: nextMessages,
        },
        streamMap: {
          ...state.streamMap,
          [conversationId]: nextStreams,
        },
      };
    });
  },
  finishMessageStream: (conversationId, messageId, status) => {
    const currentState = get();
    const messages = currentState.messageMap[conversationId] ?? [];
    const streams = currentState.streamMap[conversationId] ?? [];
    const hasMessage = messages.some((message) => message.id === messageId);
    const hasStream = streams.some((stream) => stream.messageId === messageId);
    if (!hasMessage || !hasStream) {
      return;
    }

    set((state) => {
      const currentMessages = state.messageMap[conversationId] ?? [];
      const currentStreams = state.streamMap[conversationId] ?? [];
      const nextMessages = currentMessages.map((message) =>
        message.id === messageId ? { ...message, status } : message,
      );
      const nextStreams = currentStreams.filter(
        (stream) => stream.messageId !== messageId,
      );
      return {
        messageMap: {
          ...state.messageMap,
          [conversationId]: nextMessages,
        },
        streamMap: {
          ...state.streamMap,
          [conversationId]: nextStreams,
        },
        conversations: touchConversation(state.conversations, conversationId),
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

/** 选择当前会话是否仍有流式输出，切换会话后互不干扰。 */
export function selectCurrentIsStreaming(state: ConversationState): boolean {
  if (!state.currentId) {
    return false;
  }
  return (state.streamMap[state.currentId] ?? emptyStreams).length > 0;
}
