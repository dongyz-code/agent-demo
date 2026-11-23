import type { AgentMessagePart } from '@repo/types';

/**
 * 从检索工具结果里去掉当前用户已经不能打开的片段。
 *
 * 回答正文保持原样，只处理结构化引用。
 *
 * @param content 消息片段。
 * @param readableDocumentIds 当前仍可打开的文档。
 * @returns 过滤后的片段。
 */
export function redactSearchResults(
  content: AgentMessagePart[],
  readableDocumentIds: Set<string>,
): AgentMessagePart[] {
  return content.map((part) => {
    if (part.type !== 'tool-result' || part.toolName !== 'searchKnowledgeBase') {
      return part;
    }
    if (!part.output || typeof part.output !== 'object') return part;
    const output = part.output as { chunks?: unknown; note?: string };
    if (!Array.isArray(output.chunks)) return part;
    const chunks = output.chunks.filter((chunk) => {
      if (!chunk || typeof chunk !== 'object') return false;
      const documentId = (chunk as { document_id?: unknown }).document_id;
      return (
        typeof documentId === 'string' && readableDocumentIds.has(documentId)
      );
    });
    return {
      ...part,
      output: {
        ...output,
        chunks,
        note: chunks.length ? output.note : '引用已不可访问',
      },
    };
  });
}
