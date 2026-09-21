import {
  AlertCircleIcon,
  BrainIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  Loader2Icon,
  WrenchIcon,
} from 'lucide-react';

import type { AgentMessageToolView } from '../utils.js';

type MessageProcessProps = {
  /** 当前 assistant 消息中的思考文本。 */
  reasoning?: string;
  /** 当前 assistant 消息中的工具调用片段。 */
  toolParts: AgentMessageToolView[];
  /** 当前消息是否仍在流式生成。 */
  isStreaming: boolean;
  /** 当前消息是否已有正文；思考转入正文时自动折叠思考过程。 */
  hasText: boolean;
};

/** 工具状态展示配置；state 对应 AI SDK 的工具片段状态。 */
type ToolStatus = {
  /** 状态图标节点。 */
  icon: React.ReactNode;
  /** 状态样式。 */
  className: string;
};

/**
 * 渲染 assistant 的思考与工具执行过程。
 *
 * 思考和工具默认折叠，并按执行顺序渲染在同一过程流中；
 * 每条记录有独立入口，但共享消息宽度，避免形成卡片式消息。
 *
 * @param props 思考文本、工具片段和流式状态。
 * @returns 无过程内容时返回 null，否则返回过程面板。
 */
export function MessageProcess({
  reasoning,
  toolParts,
  isStreaming,
  hasText,
}: MessageProcessProps) {
  if (!reasoning && toolParts.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 w-full space-y-1 text-xs">
      {reasoning ? (
        <details open={isStreaming && !hasText} className="group/process">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-muted-foreground select-none hover:text-foreground">
            <BrainIcon className="size-3.5" aria-hidden />
            <span>思考</span>
            <ChevronRightIcon
              className="size-3 transition-transform group-open/process:rotate-90"
              aria-hidden
            />
          </summary>
          <div className="mt-1.5 pl-5.5 leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {reasoning}
          </div>
        </details>
      ) : null}
      {toolParts.map((part) => (
        <ToolProcess
          key={part.toolCallId}
          part={part}
          isStreaming={isStreaming}
        />
      ))}
    </div>
  );
}

/**
 * 渲染单次工具调用。
 *
 * @param props 工具片段和流式状态。
 * @returns 工具名称、状态以及输入输出记录。
 */
function ToolProcess({
  part,
  isStreaming,
}: {
  part: AgentMessageToolView;
  isStreaming: boolean;
}) {
  const status = getToolStatus(part, isStreaming);
  const input = formatToolValue(part.input);
  const output = formatToolValue(part.output);

  return (
    <details className="group/process">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-0.5 text-muted-foreground select-none hover:text-foreground">
        <WrenchIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 max-w-full truncate font-mono">
          {part.toolName ?? part.type.replace('tool-', '')}
        </span>
        <span className={status.className}>{status.icon}</span>
        <ChevronRightIcon
          className="size-3 transition-transform group-open/process:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="mt-1.5 w-full space-y-1 pl-5.5">
        <section className="space-y-1">
          <div className="text-muted-foreground">输入</div>
          <pre className="w-full font-mono leading-relaxed text-foreground whitespace-pre-wrap">
            {input}
          </pre>
        </section>
        {part.state === 'output-available' ? (
          <section className="space-y-1">
            <div className="text-muted-foreground">输出</div>
            <pre className="w-full font-mono leading-relaxed text-foreground whitespace-pre-wrap">
              {output}
            </pre>
          </section>
        ) : null}
        {part.state === 'output-error' ? (
          <section className="space-y-1">
            <div className="text-muted-foreground">错误</div>
            <div className="leading-relaxed text-destructive">
              {part.errorText ?? '工具执行失败'}
            </div>
          </section>
        ) : null}
      </div>
    </details>
  );
}

/**
 * 获取工具调用的状态展示配置。
 *
 * @param part 工具片段。
 * @param isStreaming 当前消息是否仍在流式生成。
 * @returns 状态文案、图标和样式。
 */
function getToolStatus(
  part: AgentMessageToolView,
  isStreaming: boolean,
): ToolStatus {
  if (part.state === 'output-available') {
    return {
      icon: <CheckCircle2Icon className="size-3" aria-hidden />,
      className: 'text-emerald-600 dark:text-emerald-400',
    };
  }

  if (part.state === 'output-error') {
    return {
      icon: <AlertCircleIcon className="size-3" aria-hidden />,
      className: 'text-destructive',
    };
  }

  return {
    icon: <Loader2Icon className="size-3 animate-spin" aria-hidden />,
    className: 'text-muted-foreground',
  };
}

/**
 * 格式化工具入参或输出。
 *
 * @param value 待格式化的值。
 * @returns JSON 文本；无法序列化时回退为字符串。
 */
function formatToolValue(value: unknown) {
  return JSON.stringify(value, null, 2) ?? String(value);
}
