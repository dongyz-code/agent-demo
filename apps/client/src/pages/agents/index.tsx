import { useEffect, useRef, useState } from 'react';

import { useConversationModel } from '@/model';
import { api } from '@/utils/api';

import type { AgentChatMessage } from './hooks/useAgentChat';
import { useAgentChat } from './hooks/useAgentChat';
import { MessageComposer } from './components/MessageComposer';
import { MessageList } from './components/MessageList';
import { AgentEmptyState } from './components/AgentEmptyState';

/** 服务端历史消息返回行的最小形状。 */
type AgentMessageRecord = {
  message_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: { type: string; text?: string }[];
};

/** 空消息常量，避免未选中会话时反复生成新数组。 */
const emptyChatMessages: AgentChatMessage[] = [];

/**
 * 把服务端历史消息转换为 AI SDK UIMessage。
 *
 * @param record 服务端消息行。
 * @returns 只保留当前 UI 会渲染的 text/reasoning parts。
 */
function toAgentChatMessage(record: AgentMessageRecord): AgentChatMessage {
  return {
    id: record.message_id,
    role: record.role === 'user' ? 'user' : 'assistant',
    parts: record.content
      .filter(
        (part): part is { type: 'text' | 'reasoning'; text: string } => {
          return (
            (part.type === 'text' || part.type === 'reasoning') &&
            typeof part.text === 'string'
          );
        },
      )
      .map((part) => ({ type: part.type, text: part.text })),
  };
}

/**
 * 渲染 Agent 对话主区：未选会话时展示空状态，选中后展示消息流与输入区。
 *
 * @returns 对话主区节点。
 */
export default function AgentPage() {
  const conversations = useConversationModel((state) => state.conversations);
  const currentId = useConversationModel((state) => state.currentId);
  const createConversation = useConversationModel(
    (state) => state.createConversation,
  );
  const requestedMessageIdsRef = useRef(new Set<string>());
  const [historyMessages, setHistoryMessages] = useState<
    Record<string, AgentChatMessage[]>
  >({});
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const current = currentId
    ? conversations.find((c) => c.id === currentId)
    : null;
  const activeConversationId = current?.id ?? 'no-conversation';
  const initialMessages = current
    ? historyMessages[current.id] ?? emptyChatMessages
    : emptyChatMessages;
  const chat = useAgentChat({
    conversationId: activeConversationId,
    initialMessages,
  });

  useEffect(() => {
    if (!current?.serverId || requestedMessageIdsRef.current.has(current.id)) {
      return;
    }
    requestedMessageIdsRef.current.add(current.id);
    void api('/agent/message-list', {
      conversation_id: current.serverId,
      limit: [0, 100],
      with_count: false,
    })
      .then((result) => {
        setHistoryMessages((state) => ({
          ...state,
          [current.id]: result.list.map(toAgentChatMessage),
        }));
      })
      .catch(() => {
        requestedMessageIdsRef.current.delete(current.id);
      });
  }, [conversations, current]);

  useEffect(() => {
    if (!current || pendingPrompt === null || chat.status !== 'ready') {
      return;
    }
    setPendingPrompt(null);
    void chat.sendMessage({ text: pendingPrompt });
  }, [current, pendingPrompt, chat.status, chat.sendMessage]);

  /**
   * 发起快捷提问；未选中会话时先创建本地会话，待 hook 重建后再发送。
   *
   * @param prompt 快捷提问文本。
   */
  function startPrompt(prompt: string) {
    if (!current) {
      createConversation();
      setPendingPrompt(prompt);
      return;
    }
    void chat.sendMessage({ text: prompt });
  }

  if (!current) {
    return (
      <div className="h-full overflow-hidden">
        <AgentEmptyState onPrompt={startPrompt} />
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      <MessageList
        messages={chat.messages}
        conversationId={current.id}
        isStreaming={chat.status === 'submitted' || chat.status === 'streaming'}
        onPrompt={startPrompt}
        onRegenerate={() => {
          void chat.regenerate();
        }}
      />
      <MessageComposer
        conversationId={current.id}
        isStreaming={chat.status === 'submitted' || chat.status === 'streaming'}
        onSend={(text, reasoning) => {
          void chat.sendMessage({ text }, { body: { reasoning } });
        }}
        onStop={() => {
          void chat.stop();
        }}
      />
    </div>
  );
}
