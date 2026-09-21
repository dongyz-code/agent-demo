import { useEffect } from 'react';
import { useParams } from '@tanstack/react-router';

import { AgentEmptyState } from './components/AgentEmptyState';
import { useConversationList } from './hooks/useConversationList.js';
import { useAgentChat } from './hooks/useAgentChat.js';
import { MessageComposer } from './components/MessageComposer';
import { MessageList } from './components/MessageList';
import { routerGo } from '@/router';

import { agentChatRegistry } from './chat-registry.js';

/**
 * 渲染 Agent 对话主区：未选会话时展示空状态，选中后展示消息流与输入区。
 *
 * @returns 对话主区节点。
 */
export default function AgentPage() {
  const { current } = useConversationList();
  const routeParams = useParams({ strict: false });
  const chat = useAgentChat({ conversation: current });
  const isStreaming =
    chat.status === 'submitted' || chat.status === 'streaming';

  useEffect(() => {
    return agentChatRegistry.subscribeConversationCreated(
      async (conversationId) => {
        if (routeParams.conversationId !== undefined) {
          return;
        }
        await routerGo('agents', {
          params: { conversationId },
          replace: true,
        });
      },
    );
  }, [routeParams.conversationId]);

  if (!current) {
    if (chat.messages.length > 0 || isStreaming) {
      return (
        <div className="relative h-full overflow-hidden">
          <MessageList
            messages={chat.messages}
            error={chat.error}
            conversationId="draft"
            isStreaming={isStreaming}
            onPrompt={chat.startPrompt}
            onRegenerate={() => {
              void chat.regenerate();
            }}
          />
          <MessageComposer
            conversationId="draft"
            isStreaming={isStreaming}
            onSend={(text, reasoning) => {
              void chat.sendMessage(
                { text, metadata: { reasoning } },
                { body: { reasoning } },
              );
            }}
            onStop={() => {
              void chat.stop();
            }}
          />
        </div>
      );
    }

    return (
      <div className="h-full overflow-hidden">
        <AgentEmptyState onPrompt={chat.startPrompt} />
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden">
      <MessageList
        messages={chat.messages}
        error={chat.error}
        conversationId={current.id}
        isStreaming={isStreaming}
        onPrompt={chat.startPrompt}
        onRegenerate={() => {
          void chat.regenerate();
        }}
      />
      <MessageComposer
        conversationId={current.id}
        isStreaming={isStreaming}
        onSend={(text, reasoning) => {
          void chat.sendMessage(
            { text, metadata: { reasoning } },
            { body: { reasoning } },
          );
        }}
        onStop={() => {
          void chat.stop();
        }}
      />
    </div>
  );
}
