import { useEffect, useRef } from 'react';

import { SparklesIcon } from 'lucide-react';

import { Separator } from '@/components/ui';

import { MarkdownContent } from './MarkdownContent';

import type { AgentChatMessage } from '../hooks/useAgentChat';

/**
 * 从消息 parts 中提取文本片段并拼接，tool-call/tool-result 暂不展示。
 *
 * @param message 当前消息。
 * @returns 拼接后的文本，可能为空字符串。
 */
function extractParts(
  message: AgentChatMessage,
  type: 'text' | 'reasoning',
): string {
  return message.parts
    .filter(
      (part): part is { type: 'text' | 'reasoning'; text: string } =>
        part.type === type,
    )
    .map((part) => part.text)
    .join('\n');
}

type MessageListProps = {
  /** 当前会话的消息列表。 */
  messages: AgentChatMessage[];
  /** 最后一条消息是否仍在生成。 */
  isStreaming: boolean;
  /** 当前会话 id；切换会话时恢复底部定位。 */
  conversationId: string;
};

/**
 * 判断滚动容器是否贴近底部。
 *
 * @param container 消息滚动容器。
 * @returns 距底部 80px 内返回 true，用于决定是否跟随流式输出。
 */
function isNearBottom(container: HTMLElement) {
  const distanceToBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  return distanceToBottom <= 80;
}

/**
 * 渲染当前会话的消息流，按角色分左右气泡，新消息时自动滚动到底部。
 *
 * @param props 当前消息列表。
 * @returns 消息流节点。
 */
export function MessageList({
  messages,
  isStreaming,
  conversationId,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const shouldFollowBottomRef = useRef(true);

  /**
   * 记录用户当前是否位于底部；用户上滑查看历史后暂停自动跟随。
   */
  function handleScroll() {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    shouldFollowBottomRef.current = isNearBottom(container);
  }

  useEffect(() => {
    shouldFollowBottomRef.current = true;
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [conversationId]);

  useEffect(() => {
    if (!shouldFollowBottomRef.current) {
      return;
    }
    let behavior: 'auto' | 'smooth' = 'auto';
    if (!isStreaming) {
      behavior = 'smooth';
    }
    endRef.current?.scrollIntoView({ behavior });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        输入消息开始对话
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="absolute inset-0 overflow-y-auto px-4 pt-6 pb-96"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const reasoning = extractParts(message, 'reasoning');
          const text = extractParts(message, 'text');
          if (isUser) {
            return (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
                  {text}
                </div>
              </div>
            );
          }
          return (
            <div key={message.id} className="flex justify-start">
              <div
                className="max-w-[80%] rounded-lg bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground"
              >
                {reasoning ? (
                  <details className="mb-2 overflow-hidden rounded-lg border border-border bg-background">
                    <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground select-none">
                      <SparklesIcon className="size-3.5" aria-hidden />
                      思考过程
                    </summary>
                    <Separator />
                    <div className="max-h-56 overflow-y-auto px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {reasoning}
                    </div>
                  </details>
                ) : null}
                {text ? (
                  <MarkdownContent content={text} />
                ) : (
                  <span className="text-muted-foreground">
                    {isStreaming ? '正在生成…' : '（非文本消息）'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
