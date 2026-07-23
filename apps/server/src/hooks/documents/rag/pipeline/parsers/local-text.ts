import { hashToUuid } from '../ids.js';

import type { DocumentParsedBlock } from '@repo/types';
import type { DocumentParser } from '../types.js';

/** 防止本地文本解析器把异常大文件整体载入内存。 */
const MAX_LOCAL_TEXT_BYTES = 32 * 1024 * 1024;

/** Markdown、纯文本和 CSV 的本地解析器。 */
export const localTextParser: DocumentParser = {
  name: 'local-text',
  version: '1',
  contentTypes: ['text/plain', 'text/markdown', 'text/csv'],
  async parse({ file }) {
    const source = await readText(file);
    if (file.contentType === 'text/csv') {
      return parseCsv(source, file.fileId);
    }
    return parseText(source, file.fileId, file.contentType === 'text/markdown');
  },
};

/** 读取受限大小 UTF-8 文本。 */
async function readText(file: Parameters<DocumentParser['parse']>[0]['file']) {
  if (file.size > MAX_LOCAL_TEXT_BYTES) {
    throw new Error('DOCUMENT_TEXT_TOO_LARGE: 本地文本解析上限为 32 MiB');
  }
  const chunks: Buffer[] = [];
  const stream = await file.openStream();
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 将 Markdown 或普通文本转换为标题与段落块。 */
function parseText(source: string, fileId: string, markdown: boolean) {
  const blocks: DocumentParsedBlock[] = [];
  const headingPath: string[] = [];
  const sections = source.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  sections.forEach((section) => {
    const text = section.trim();
    if (!text) {
      return;
    }
    const heading = markdown ? /^(#{1,6})\s+(.+)$/.exec(text) : null;
    if (heading) {
      const level = heading[1]!.length;
      const title = heading[2]!.trim();
      headingPath.splice(level - 1, headingPath.length, title);
      blocks.push(
        createBlock(fileId, blocks.length, 'heading', title, headingPath),
      );
      return;
    }
    blocks.push(
      createBlock(fileId, blocks.length, 'paragraph', text, headingPath),
    );
  });
  return blocks;
}

/** 将 CSV 按最多 100 行组成表格块，首行表头重复注入后续块。 */
function parseCsv(source: string, fileId: string) {
  const rows = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((row) => row.trim());
  if (!rows.length) {
    return [];
  }
  const header = rows[0]!;
  const blocks: DocumentParsedBlock[] = [];
  for (let start = 1; start < rows.length; start += 99) {
    const text = [header, ...rows.slice(start, start + 99)].join('\n');
    blocks.push(createBlock(fileId, blocks.length, 'table', text, []));
  }
  if (rows.length === 1) {
    blocks.push(createBlock(fileId, 0, 'table', header, []));
  }
  return blocks;
}

/** 创建确定性统一解析块。 */
function createBlock(
  fileId: string,
  position: number,
  type: DocumentParsedBlock['type'],
  text: string,
  headingPath: string[],
): DocumentParsedBlock {
  return {
    blockId: hashToUuid(`${fileId}:local-text:${position}:${text}`),
    type,
    text,
    headingPath: [...headingPath],
    page: null,
    position,
    metadata: {},
  };
}
