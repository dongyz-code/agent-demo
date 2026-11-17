import { ROOT_ERROR } from '@/configs/index.js';
import { collectMimes, readStreamToBuffer, uuidv5 } from '@/utils/index.js';
import { getFileExtension } from '@repo/shared';

import type { DocumentParsedBlock } from '@repo/types';
import type { DocumentParser } from './types.js';

/** 防止本地文本解析器把异常大文件整体载入内存。 */
const MAX_LOCAL_TEXT_BYTES = 32 * 1024 * 1024;

/** 将 Markdown、纯文本和 CSV 直接转换为统一文档块。 */
export const textParser: DocumentParser = {
  name: 'text',
  version: '1',
  contentTypes: collectMimes('text'),
  async parse({ file }) {
    const source = await readText(file);
    const extension = getFileExtension(file.filename);
    if (extension === 'csv') {
      return parseCsv(source, file.key);
    }
    return parseTextContent(source, file.key, extension === 'md');
  },
};

/** 读取受限大小 UTF-8 文本。 */
async function readText(file: Parameters<DocumentParser['parse']>[0]['file']) {
  if (file.size > MAX_LOCAL_TEXT_BYTES) {
    throw new ROOT_ERROR('本地文本解析上限为 32 MiB');
  }
  const buffer = await readStreamToBuffer(
    await file.openStream(),
    MAX_LOCAL_TEXT_BYTES,
  );
  return buffer.toString('utf8');
}

/**
 * 将 Markdown 或普通文本转换为标题、段落、表格和代码块。
 *
 * Markdown 按行识别标题、围栏代码和表格，避免空行把代码或表格拆散。
 * 普通文本仍按空行分成段落。
 *
 * @param source 待解析的 UTF-8 文本。
 * @param fileId 源文件标识，用于生成确定性块 ID。
 * @param markdown 是否识别 Markdown 结构。
 * @returns 保持原始顺序的文档块。
 */
export function parseTextContent(
  source: string,
  fileId: string,
  markdown: boolean,
) {
  const text = source.replace(/\r\n?/g, '\n');
  if (!markdown) {
    return text
      .split(/\n{2,}/)
      .map((section) => section.trim())
      .filter(Boolean)
      .map((section, position) =>
        createBlock(fileId, position, 'paragraph', section, []),
      );
  }
  return parseMarkdown(text, fileId);
}

/**
 * 按行扫描 Markdown，把标题、代码围栏和表格从正文里分开。
 *
 * @param source 已统一换行的 Markdown。
 * @param fileId 源文件标识。
 * @returns 按出现顺序排列的文档块。
 */
function parseMarkdown(source: string, fileId: string) {
  const lines = source.split('\n');
  const blocks: DocumentParsedBlock[] = [];
  const headingPath: string[] = [];
  const paragraph: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join('\n').trim();
    paragraph.length = 0;
    if (!text) return;
    pushRichText(blocks, fileId, text, headingPath);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim().startsWith('```')) {
      flushParagraph();
      const code = [line];
      index += 1;
      while (index < lines.length && !lines[index]?.trim().startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) {
        code.push(lines[index] ?? '');
      }
      blocks.push(
        createBlock(fileId, blocks.length, 'code', code.join('\n'), headingPath),
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(\S.*?)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1]!.length;
      const title = heading[2]!.trim();
      headingPath.splice(level - 1, headingPath.length, title);
      blocks.push(
        createBlock(fileId, blocks.length, 'heading', title, headingPath),
      );
      continue;
    }
    if (isTableStart(lines, index)) {
      flushParagraph();
      const table = [line];
      index += 1;
      while (index < lines.length && isTableRow(lines[index] ?? '')) {
        table.push(lines[index] ?? '');
        index += 1;
      }
      index -= 1;
      blocks.push(
        createBlock(fileId, blocks.length, 'table', table.join('\n'), headingPath),
      );
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

/**
 * 把可能含 HTML 表格的正文拆成段落和表格。
 *
 * MinerU 常把 Excel、PDF 里的表写成 HTML。先转成 Markdown 行，后续才能按行切并重复表头。
 *
 * @param blocks 正在累积的文档块。
 * @param fileId 源文件标识。
 * @param text 一段不含空行的正文。
 * @param headingPath 当前标题路径。
 */
function pushRichText(
  blocks: DocumentParsedBlock[],
  fileId: string,
  text: string,
  headingPath: string[],
) {
  if (!/<table[\s>]/i.test(text)) {
    blocks.push(
      createBlock(fileId, blocks.length, 'paragraph', text, headingPath),
    );
    return;
  }
  const pattern = /<table[\s\S]*?<\/table>/gi;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(last, match.index).trim();
    if (before) {
      blocks.push(
        createBlock(fileId, blocks.length, 'paragraph', before, headingPath),
      );
    }
    const markdown = htmlTableToMarkdown(match[0]);
    if (markdown) {
      blocks.push(
        createBlock(fileId, blocks.length, 'table', markdown, headingPath),
      );
    }
    last = (match.index ?? 0) + match[0].length;
  }
  const after = text.slice(last).trim();
  if (after) {
    blocks.push(
      createBlock(fileId, blocks.length, 'paragraph', after, headingPath),
    );
  }
}

/**
 * 把 HTML 表格转成带分隔行的 Markdown 表格。
 *
 * @param html 一个 table 元素。
 * @returns Markdown 表格；没有可识别的行时为空字符串。
 */
function htmlTableToMarkdown(html: string) {
  const rows = [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) => {
    const cells = [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (cell) =>
        cell[1]!
          .replace(/<[^>]+>/g, ' ')
          .replace(/\|/g, '\\|')
          .replace(/\s+/g, ' ')
          .trim(),
    );
    return `| ${cells.join(' | ')} |`;
  });
  if (!rows.length) return '';
  const width = Math.max(rows[0]!.split('|').length - 2, 1);
  const separator = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  return [rows[0], separator, ...rows.slice(1)].join('\n');
}

/**
 * 判断这一行是不是 Markdown 表格行。
 *
 * @param line 原始行。
 * @returns 以竖线开头并结尾时为 true。
 */
function isTableRow(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

/**
 * 判断从当前行开始是不是一张表。
 *
 * 分隔行或连续两行表格行都算，避免把正文里偶然出现的竖线当成表。
 *
 * @param lines Markdown 全文行。
 * @param index 当前行下标。
 * @returns 需要按表格消费时为 true。
 */
function isTableStart(lines: string[], index: number) {
  if (!isTableRow(lines[index] ?? '')) return false;
  const next = lines[index + 1] ?? '';
  if (isMarkdownSeparator(next)) return true;
  return isTableRow(next);
}

/**
 * 判断是不是 Markdown 表格分隔行。
 *
 * @param line 原始行。
 * @returns `| --- | --- |` 这种行返回 true。
 */
function isMarkdownSeparator(line: string) {
  const trimmed = line.trim();
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed);
}

/**
 * 将 CSV 读成一张 Markdown 表。
 *
 * 引号里的逗号和换行留在单元格内。切分阶段再按行分组并重复表头。
 *
 * @param source CSV 原文。
 * @param fileId 源文件标识。
 * @returns 没有数据行时为空数组，否则只有一个表格块。
 */
function parseCsv(source: string, fileId: string) {
  const records = readCsvRecords(source);
  if (!records.length) return [];
  const header = records[0]!.map(escapeTableCell).join(' | ');
  const separator = records[0]!.map(() => '---').join(' | ');
  const lines = [
    `| ${header} |`,
    `| ${separator} |`,
    ...records.slice(1).map((record) => {
      const cells = records[0]!.map((_, index) => escapeTableCell(record[index] ?? ''));
      return `| ${cells.join(' | ')} |`;
    }),
  ];
  return [createBlock(fileId, 0, 'table', lines.join('\n'), [])];
}

/**
 * 按 RFC 4180 的引号规则读取 CSV 记录。
 *
 * @param source CSV 原文。
 * @returns 每行一个单元格数组；空文件返回空数组。
 */
function readCsvRecords(source: string) {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ',') {
      record.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      record.push(cell);
      cell = '';
      if (record.some((item) => item.trim())) records.push(record);
      record = [];
      continue;
    }
    cell += char;
  }
  if (cell.length || record.length) {
    record.push(cell);
    if (record.some((item) => item.trim())) records.push(record);
  }
  return records;
}

/**
 * 去掉单元格里的换行和竖线，保证一条记录仍占 Markdown 表格的一行。
 *
 * @param value 单元格原文。
 * @returns 可放进 Markdown 单元格的文本。
 */
function escapeTableCell(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
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
    blockId: uuidv5(`${fileId}:local-text:${position}:${text}`),
    type,
    text,
    headingPath: [...headingPath],
    page: null,
    position,
    metadata: {},
  };
}
