import {
  ClipboardListIcon,
  FileSearchIcon,
  DatabaseIcon,
  SparklesIcon,
  SquareKanbanIcon,
} from 'lucide-react';

import { Button } from '@/components/ui';

type AgentEmptyStateProps = {
  /** 点击快捷提问后直接发起对话。 */
  onPrompt: (prompt: string) => void;
};

/** 快捷提问配置；图标和文案一起渲染，降低冷启动输入成本。 */
const promptStarters = [
  {
    icon: FileSearchIcon,
    title: '分析医学对比研究',
    prompt: '请帮我分析一篇医学对比研究的结论、证据强度和局限性。',
  },
  {
    icon: ClipboardListIcon,
    title: '总结技术方案',
    prompt: '请帮我总结一份技术方案的核心设计、风险和落地步骤。',
  },
  {
    icon: DatabaseIcon,
    title: '生成 SQL 查询思路',
    prompt: '请根据我的业务需求，帮我设计 SQL 查询思路并解释关键条件。',
  },
  {
    icon: SquareKanbanIcon,
    title: '拆解项目任务',
    prompt: '请帮我把一个项目目标拆解成可执行任务、里程碑和验收标准。',
  },
];

/**
 * 渲染 Agent 首屏空状态，提供欢迎标识和快捷提问引导。
 *
 * @param props 快捷提问回调。
 * @returns 空状态节点。
 */
export function AgentEmptyState({ onPrompt }: AgentEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SparklesIcon className="size-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            你好，我是你的智能助手
          </h2>
          <p className="text-sm text-muted-foreground">
            今天有什么我可以帮忙的？我可以检索知识库、分析资料、总结方案，也会展示思考过程。
          </p>
        </div>
      </div>

      <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
        {promptStarters.map(({ icon: Icon, title, prompt }) => (
          <Button
            key={title}
            variant="outline"
            onClick={() => onPrompt(prompt)}
            className="h-auto justify-start gap-3 rounded-xl px-4 py-3 text-left"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 text-sm font-medium">{title}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
