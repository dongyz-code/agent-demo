import { useEffect, useRef } from 'react';

import type { ConversationMessage } from '@/model';

import { cn } from '@/utils';

/**
 * 从消息 parts 中提取文本片段并拼接，tool-call/tool-result 暂不展示。
 *
 * @param message 当前消息。
 * @returns 拼接后的文本，可能为空字符串。
 */
function extractText(message: ConversationMessage): string {
  return message.parts
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map((part) => part.text)
    .join('\n');
}

type MessageListProps = {
  /** 当前会话的消息列表。 */
  messages: ConversationMessage[];
};

/**
 * 渲染当前会话的消息流，按角色分左右气泡，新消息时自动滚动到底部。
 *
 * @param props 当前消息列表。
 * @returns 消息流节点。
 */
export function MessageList({ messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        输入消息开始对话
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const text = extractText(message);
          return (
            <div
              key={message.id}
              className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[80%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground',
                )}
              >
                {text || '（非文本消息）'}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
