import { ArrowUpIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { Button, Textarea } from '@/components/ui';

import { useConversationStream } from '../hooks/useConversationStream';

type MessageComposerProps = {
  /** 当前会话 id；为空时禁用输入。 */
  conversationId: string | null;
};

/**
 * 渲染对话输入区，Enter 发送、Shift+Enter 换行。
 *
 * @param props 当前会话 id。
 * @returns 输入区节点。
 */
export function MessageComposer({ conversationId }: MessageComposerProps) {
  const [value, setValue] = useState('');
  const { isStreaming, sendMessage } = useConversationStream();

  const disabled = !conversationId || isStreaming || value.trim().length === 0;

  /** 提交输入文本；流创建失败时保留原文，避免用户重新输入。 */
  function send() {
    if (!conversationId || disabled) {
      return;
    }
    if (sendMessage(conversationId, value)) {
      setValue('');
    }
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
