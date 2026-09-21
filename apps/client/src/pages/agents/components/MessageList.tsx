import { useEffect, useRef } from 'react';
import { CopyIcon, RefreshCwIcon } from 'lucide-react';

import { Button } from '@/components/ui';
import { message as showMessage } from '@/utils';

import { MarkdownContent } from './MarkdownContent';
import { AgentEmptyState } from './AgentEmptyState';
import { MessageProcess } from './MessageProcess';
import {
  extractMessageParts,
  extractMessageToolParts,
  type AgentMessageToolView,
} from '../utils.js';

import { type AgentChatMessage } from '../hooks/useAgentChat.js';

type MessageListProps = {
  /** 当前会话的消息列表。 */
  messages: AgentChatMessage[];
  /** 最后一条消息是否仍在生成。 */
  isStreaming: boolean;
  /** 当前请求错误；用于在消息流顶部向用户反馈失败原因。 */
  error?: Error | undefined;
  /** 服务端会话 id；草稿态为空，切换真实会话时恢复底部定位。 */
  conversationId?: string;
  /** 点击空状态快捷提问后发起请求。 */
  onPrompt: (prompt: string) => void;
  /** 重新生成最后一条 assistant 回复。 */
  onRegenerate: () => void;
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
  error,
  conversationId,
  onPrompt,
  onRegenerate,
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

  /**
   * 复制 assistant 文本内容；剪贴板不可用时提示用户手动选择。
   *
   * @param text 待复制的完整回复文本。
   */
  async function copyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showMessage.success('已复制回复');
    } catch {
      showMessage.error('当前浏览器暂不支持复制');
    }
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

  if (messages.length === 0 && !error) {
    return (
      <div className="absolute inset-0">
        <AgentEmptyState onPrompt={onPrompt} />
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
        {error ? (
          <div
            role="status"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            请求失败：{error.message || '请稍后重试'}
          </div>
        ) : null}
        {messages.map((message) => {
          const isUser = message.role === 'user';
          const reasoning = extractMessageParts(message, 'reasoning');
          const text = extractMessageParts(message, 'text');
          const toolParts = extractMessageToolParts(message);
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
            <div key={message.id} className="group/message flex justify-start">
              <div className="w-full rounded-lg bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
                <MessageProcess
                  reasoning={reasoning}
                  toolParts={toolParts}
                  isStreaming={isStreaming}
                  hasText={Boolean(text)}
                />
                {text ? (
                  <MarkdownContent content={text} />
                ) : (
                  <span className="text-muted-foreground">
                    {isStreaming ? '正在生成…' : '（非文本消息）'}
                  </span>
                )}
                {text ? (
                  <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => void copyMessage(text)}
                      aria-label="复制回复"
                      title="复制回复"
                    >
                      <CopyIcon className="size-3.5" aria-hidden />
                    </Button>
                    {!isStreaming && message.id === messages.at(-1)?.id ? (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={onRegenerate}
                        aria-label="重新生成回复"
                        title="重新生成回复"
                      >
                        <RefreshCwIcon className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
