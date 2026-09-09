import { ArrowUpIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import type { ConversationMessage } from '@/model';

import { Button, Textarea } from '@/components/ui';
import { useConversationModel } from '@/model';

type MessageComposerProps = {
  /** 当前会话 id；为空时禁用输入。 */
  conversationId: string | null;
};

/**
 * 渲染对话输入区，Enter 发送、Shift+Enter 换行，发送后追加 mock 助手回复。
 *
 * @param props 当前会话 id。
 * @returns 输入区节点。
 */
export function MessageComposer({ conversationId }: MessageComposerProps) {
  const [value, setValue] = useState('');
  const appendMessage = useConversationModel((state) => state.appendMessage);

  const disabled = !conversationId || value.trim().length === 0;

  /** 追加用户消息并模拟一条助手回复，接真接口时替换为 SSE 流式消费。 */
  function send() {
    if (!conversationId || disabled) {
      return;
    }
    const text = value.trim();
    setValue('');
    const userMessage: ConversationMessage = {
      id: `m-${crypto.randomUUID()}`,
      role: 'user',
      status: 'active',
      parts: [{ type: 'text', text }],
    };
    appendMessage(conversationId, userMessage);
    // mock：600ms 后追加一条助手回复，让交互可感。
    setTimeout(() => {
      appendMessage(conversationId, {
        id: `m-${crypto.randomUUID()}`,
        role: 'assistant',
        status: 'active',
        parts: [{ type: 'text', text: '（mock 回复）已收到你的消息，正在处理…' }],
      });
    }, 600);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            conversationId
              ? '输入消息，Enter 发送，Shift+Enter 换行'
              : '请先选择或新建会话'
          }
          disabled={!conversationId}
          className="min-h-11 max-h-48 resize-none"
        />
        <Button
          size="icon"
          onClick={send}
          disabled={disabled}
          aria-label="发送消息"
        >
          <ArrowUpIcon className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
