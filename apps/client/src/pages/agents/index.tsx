import { AgentEmptyState } from './components/AgentEmptyState';
import { useConversationActions } from './hooks/useConversationActions.js';
import { useConversationList } from './hooks/useConversationList.js';
import { useAgentChat } from './hooks/useAgentChat.js';
import { MessageComposer } from './components/MessageComposer';
import { MessageList } from './components/MessageList';

/**
 * 渲染 Agent 对话主区：未选会话时展示空状态，选中后展示消息流与输入区。
 *
 * @returns 对话主区节点。
 */
export default function AgentPage() {
  const { current } = useConversationList();
  const { createConversation } = useConversationActions();
  const chat = useAgentChat({
    conversation: current,
    createConversation,
  });
  const isStreaming =
    chat.status === 'submitted' || chat.status === 'streaming';

  if (!current) {
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
          void chat.sendMessage({ text }, { body: { reasoning } });
        }}
        onStop={() => {
          void chat.stop();
        }}
      />
    </div>
  );
}
