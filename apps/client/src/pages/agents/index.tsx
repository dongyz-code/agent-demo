import { BotIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { useConversationModel } from '@/model';
import { api } from '@/utils/api';

import type { AgentChatMessage } from './hooks/useAgentChat';
import { useAgentChat } from './hooks/useAgentChat';
import { MessageComposer } from './components/MessageComposer';
import { MessageList } from './components/MessageList';

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

  if (!current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <BotIcon className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <p className="text-base font-medium text-foreground">
            开始一个新会话
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            选择左侧会话继续，或新建一个会话开始对话
          </p>
        </div>
        <Button onClick={() => createConversation()}>新建会话</Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-sm font-medium text-foreground">{current.title}</h1>
      </header>
      <div className="relative flex-1 overflow-hidden">
        <MessageList
          messages={chat.messages}
          conversationId={current.id}
          isStreaming={
            chat.status === 'submitted' || chat.status === 'streaming'
          }
        />
        <MessageComposer
          conversationId={current.id}
          isStreaming={
            chat.status === 'submitted' || chat.status === 'streaming'
          }
          onSend={(text, reasoning) => {
            void chat.sendMessage({ text }, { body: { reasoning } });
          }}
          onStop={() => {
            void chat.stop();
          }}
        />
      </div>
    </div>
  );
}
