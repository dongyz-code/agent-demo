import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isValidElement } from 'react';

import { Button } from '@/components/ui';

type MarkdownContentProps = {
  /** 需要渲染的 Markdown 文本。 */
  content: string;
};

/**
 * 渲染 assistant 回复中的 Markdown 与 GFM 内容。
 *
 * @param props Markdown 文本。
 * @returns 带基础排版样式的 Markdown 节点。
 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="space-y-3 wrap-break-word text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-background/80 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_pre_code]:bg-transparent [&_pre_code]:p-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          table: ({ children }) => (
            <div className="w-full overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left">
                {children}
              </table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

type CodeBlockProps = {
  /** Markdown 解析后的 code 节点。 */
  children: ReactNode;
};

/**
 * 获取代码块语言标识。
 *
 * @param children Markdown pre 节点的子节点。
 * @returns 语言名；未标注语言时返回“文本”。
 */
function getCodeLanguage(children: ReactNode) {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement(child)) {
    return '文本';
  }

  const className = (child.props as { className?: string }).className ?? '';
  const language = /language-([^ ]+)/.exec(className)?.[1];
  if (!language) {
    return '文本';
  }
  return language;
}

/**
 * 渲染带语言标签和复制按钮的代码块。
 *
 * @param props Markdown pre 子节点。
 * @returns 代码块节点。
 */
function CodeBlock({ children }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyCode() {
    const code = preRef.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background/80">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span>{getCodeLanguage(children)}</span>
        <Button
          size="icon-xs"
          variant="ghost"
          onClick={() => void copyCode()}
          aria-label="复制代码"
          title="复制代码"
        >
          {copied ? (
            <CheckIcon className="size-3.5" aria-hidden />
          ) : (
            <CopyIcon className="size-3.5" aria-hidden />
          )}
        </Button>
      </div>
      <pre ref={preRef} className="overflow-x-auto p-3 text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  );
}
