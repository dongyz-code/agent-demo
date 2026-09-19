import {
  ArrowUpIcon,
  BrainIcon,
  Maximize2Icon,
  MicIcon,
  Minimize2Icon,
  PlusIcon,
  SquareIcon,
} from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Textarea,
} from '@/components/ui';
import { cn } from '@/utils';

type MessageComposerProps = {
  /** 当前会话 id；为空时禁用输入。 */
  conversationId: string | null;
  /** 是否有请求已提交或正在流式返回。 */
  isStreaming: boolean;
  /** 发送当前用户消息；reasoning 表示本次请求是否开启思考模式。 */
  onSend: (text: string, reasoning: boolean) => void;
  /** 终止当前流式回复。 */
  onStop: () => void;
};

/**
 * 渲染对话输入区；普通态 Enter 发送，全屏态 Ctrl/Cmd + Enter 发送。
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
  const [reasoningEnabled, setReasoningEnabled] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const sendDisabled =
    !conversationId || isStreaming || value.trim().length === 0;

  /** 提交输入文本；流创建失败时保留原文，避免用户重新输入。 */
  function send() {
    if (!conversationId || sendDisabled) {
      return;
    }
    onSend(value, reasoningEnabled);
    setValue('');
    setExpanded(false);
  }

  /**
   * 处理编辑区快捷键；普通态 Enter 发送，全屏态 Ctrl/Cmd + Enter 发送，便于长文本换行。
   *
   * @param event 键盘事件。
   * @param editorExpanded 当前是否处于全屏编辑态。
   */
  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
    editorExpanded: boolean,
  ) {
    if (event.key !== 'Enter') {
      return;
    }
    if (!editorExpanded && !event.shiftKey) {
      event.preventDefault();
      send();
      return;
    }
    if (editorExpanded && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  }

  let actionButton = (
    <Button
      size="icon"
      onClick={send}
      disabled={sendDisabled}
      aria-label="发送消息"
      className="rounded-full"
    >
      <ArrowUpIcon className="size-4" aria-hidden />
    </Button>
  );

  if (isStreaming) {
    actionButton = (
      <Button
        size="icon"
        variant="destructive"
        onClick={onStop}
        aria-label="终止回复"
        className="rounded-full"
      >
        <SquareIcon className="size-4" aria-hidden />
      </Button>
    );
  }

  /**
   * 渲染复用工具栏；长文本和全屏态都吸附在编辑卡片底部，保持操作位置稳定。
   *
   * @returns 输入卡片底部工具栏节点。
   */
  function renderToolbar() {
    return (
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Button
          size="icon"
          variant="ghost"
          aria-label="添加附件"
          title="附件功能开发中"
          disabled
          className="rounded-full"
        >
          <PlusIcon className="size-4" aria-hidden />
        </Button>
        <div className="flex items-center gap-1">
          <Button
            size="default"
            variant={reasoningEnabled ? 'default' : 'ghost'}
            aria-pressed={reasoningEnabled}
            aria-label="切换思考模式"
            title="思考模式"
            onClick={() => setReasoningEnabled((enabled) => !enabled)}
            className="gap-1.5 rounded-full leading-none"
          >
            <BrainIcon className="size-4 self-center" aria-hidden />
            思考
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="语音输入"
            title="语音输入开发中"
            disabled
            className="rounded-full"
          >
            <MicIcon className="size-4" aria-hidden />
          </Button>
          {actionButton}
        </div>
      </div>
    );
  }

  /**
   * 渲染复用文本编辑区，并根据编辑态切换高度、滚动和右上角扩展按钮。
   *
   * @param editorClassName 编辑区布局类。
   * @param editorExpanded 当前是否处于全屏编辑态。
   * @returns 文本编辑区节点。
   */
  function renderEditor(editorClassName: string, editorExpanded: boolean) {
    return (
      <div className="relative flex min-h-0 flex-1">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => handleKeyDown(event, editorExpanded)}
          placeholder={conversationId ? '有问题，随便问' : '请先选择或新建会话'}
          disabled={!conversationId}
          className={cn(
            'border-none bg-transparent px-3 py-3 pr-11 resize-none overflow-y-auto focus-visible:border-transparent focus-visible:ring-0 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/50 [&::-webkit-scrollbar-track]:bg-transparent',
            editorClassName,
          )}
        />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={editorExpanded ? '收起编辑器' : '全屏编辑'}
          title={editorExpanded ? '收起编辑器' : '全屏编辑'}
          onClick={() => setExpanded(!editorExpanded)}
          className="absolute top-2 right-2 rounded-full"
        >
          {editorExpanded ? (
            <Minimize2Icon className="size-4" aria-hidden />
          ) : (
            <Maximize2Icon className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    );
  }

  return (
    <>
      {!expanded ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-b from-transparent via-background/95 to-background px-4 pt-8 pb-4">
          <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col rounded-[28px] border border-border bg-background/95 p-2 shadow-lg">
            {renderEditor(
              'min-h-11 max-h-64 field-sizing-content w-full',
              false,
            )}
            <div className="mt-2">{renderToolbar()}</div>
          </div>
        </div>
      ) : null}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          showCloseButton={false}
          className="inset-0 top-0 left-0 flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-[28px] p-3 sm:max-w-none"
        >
          <DialogTitle className="sr-only">全屏编辑消息</DialogTitle>
          <DialogDescription className="sr-only">
            在更大的编辑区域中编写长文本，Ctrl 或 Command 加 Enter 发送。
          </DialogDescription>
          <div className="flex h-full min-h-0 flex-col">
            {renderEditor('h-full w-full', true)}
            <div className="mt-3">{renderToolbar()}</div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
