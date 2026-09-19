import { ArrowUpIcon, SquareIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { Button, Textarea } from '@/components/ui';

type MessageComposerProps = {
  /** 当前会话 id；为空时禁用输入。 */
  conversationId: string | null;
  /** 是否有请求已提交或正在流式返回。 */
  isStreaming: boolean;
  /** 发送当前用户消息。 */
  onSend: (text: string) => void;
  /** 终止当前流式回复。 */
  onStop: () => void;
};

/**
 * 渲染对话输入区，Enter 发送、Shift+Enter 换行。
 *
 * @param props 当前会话 id。
 * @returns 输入区节点。
 */
export function MessageComposer({
  conversationId,
  isStreaming,
  onSend,
  onStop,
}: MessageComposerProps) {
  const [value, setValue] = useState('');

  const sendDisabled =
    !conversationId || isStreaming || value.trim().length === 0;

  /** 提交输入文本；流创建失败时保留原文，避免用户重新输入。 */
  function send() {
    if (!conversationId || sendDisabled) {
      return;
    }
    onSend(value);
    setValue('');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  let actionButton = (
    <Button
      size="icon-lg"
      onClick={send}
      disabled={sendDisabled}
      aria-label="发送消息"
      className="absolute right-2 bottom-2 rounded-full"
    >
      <ArrowUpIcon className="size-4" aria-hidden />
    </Button>
  );

  if (isStreaming) {
    actionButton = (
      <Button
        size="icon-lg"
        variant="destructive"
        onClick={onStop}
        aria-label="终止回复"
        className="absolute right-2 bottom-2 rounded-full"
      >
        <SquareIcon className="size-4" aria-hidden />
      </Button>
    );
  }

  return (
    <div className="shrink-0 border-t border-border bg-background px-4 py-3">
      <div className="relative mx-auto w-full max-w-3xl">
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
          className="min-h-12 max-h-48 resize-none pr-12"
        />
        {actionButton}
      </div>
    </div>
  );
}
