import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
    <div className="space-y-2 break-words text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-background/80 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-background/80 [&_pre]:p-3 [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
