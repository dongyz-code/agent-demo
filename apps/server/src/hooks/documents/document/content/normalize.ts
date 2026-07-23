import sanitizeHtml from 'sanitize-html';

import type { DocumentParsedBlock } from '@repo/types';

/**
 * 标准化文档解析块文本，同时保留标题、表格和代码块的结构语义。
 *
 * @param blocks 解析器统一输出块。
 * @returns 清除常见噪声后的新块数组。
 */
export function normalizeDocumentBlocks(
  blocks: DocumentParsedBlock[],
): DocumentParsedBlock[] {
  const repeatedShortLines = findRepeatedShortLines(blocks);
  return blocks
    .map((block) => ({
      ...block,
      text: normalizeBlockText(block.text, block.type),
    }))
    .filter(
      (block) =>
        block.text.length > 0 &&
        !(
          block.type === 'paragraph' && repeatedShortLines.has(block.text)
        ),
    )
    .map((block, position) => ({ ...block, position }));
}

/** 规范化单块文本。 */
function normalizeBlockText(
  value: string,
  type: DocumentParsedBlock['type'],
) {
  const safeSource = type === 'code'
    ? value
    : sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
  const unicode = safeSource
    .normalize('NFKC')
    .replace(/[\u0000\u00ad\u200b\ufeff]/g, '');
  if (type === 'code') {
    return unicode.replace(/\r\n?/g, '\n').trim();
  }
  if (type === 'table') {
    return unicode
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\|/g, ' |')
      .replace(/\|[ \t]+/g, '| ')
      .trim();
  }
  return unicode
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 找出跨页反复出现的短段落，作为页眉页脚噪声候选。 */
function findRepeatedShortLines(blocks: DocumentParsedBlock[]) {
  const counts = new Map<string, number>();
  blocks.forEach((block) => {
    const text = normalizeBlockText(block.text, block.type);
    if (block.type === 'paragraph' && text.length > 0 && text.length <= 80) {
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  });
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .map(([text]) => text),
  );
}
