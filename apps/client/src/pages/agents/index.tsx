import { BotIcon } from 'lucide-react';

import { Button } from '@/components/ui';
import { selectCurrentMessages, useConversationModel } from '@/model';

import { MessageComposer } from './components/MessageComposer';
import { MessageList } from './components/MessageList';

/**
 * 渲染 Agent 对话主区：未选会话时展示空状态，选中后展示消息流与输入区。
 *
 * @returns 对话主区节点。
 */
export default function AgentPage() {
  const conversations = useConversationModel((state) => state.conversations);
  const currentId = useConversationModel((state) => state.currentId);
  const messages = useConversationModel(selectCurrentMessages);
  const createConversation = useConversationModel(
    (state) => state.createConversation,
  );

  const current = currentId
    ? conversations.find((c) => c.id === currentId)
    : null;

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
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <h1 className="text-sm font-medium text-foreground">{current.title}</h1>
      </header>
      <MessageList messages={messages} />
      <MessageComposer conversationId={current.id} />
    </div>
  );
}
