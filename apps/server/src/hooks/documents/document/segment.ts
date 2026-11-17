import { createHash } from 'node:crypto';

import { uuidv5 } from '@/utils/index.js';
import type { DocumentParsedBlock, DocumentSegment } from '@repo/types';
import type { DocumentSegmentProfile } from './types.js';

/** 正文优先在这些边界断开，排在前面的先用。 */
const TEXT_SEPARATORS = ['\n', '。', '！', '？', '；', '. ', '!', '?', ';'];

/**
 * 按 Qwen 向量模型的经验比例估算 token。
 *
 * 汉字、中文标点和全角字符按 1 个 token 计，其余字符大约 4 个折 1 个。
 * 不能用整段字符数除以 4，否则中文段会比上限长出好几倍。
 *
 * @param text 待估算文本。
 * @returns 近似 token 数；空文本为 0。
 */
export function estimateTokens(text: string) {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (isCjk(char)) cjk += 1;
    else other += 1;
  }
  return Math.max(1, cjk + Math.ceil(other / 4));
}

/**
 * 将标准化块按结构和 token 预算切分为确定性 Segment。
 *
 * 每一段都不超过预算，除非单独一行表格或一行代码本身就放不下。
 * 重叠只取上一段尾部、且不超过重叠预算；新标题不带上一节的正文。
 *
 * @param documentVersionId 文档版本标识。
 * @param blocks 标准化解析块。
 * @param profile Segment 配置版本。
 * @returns 按文档顺序排列的 Segment。
 */
export function createDocumentSegments({
  documentVersionId,
  blocks,
  profile,
}: {
  documentVersionId: string;
  blocks: DocumentParsedBlock[];
  profile: DocumentSegmentProfile;
}): DocumentSegment[] {
  const units = blocks.flatMap((block) => splitOversizedBlock(block, profile));
  const groups: DocumentParsedBlock[][] = [];
  let current: DocumentParsedBlock[] = [];

  for (const unit of units) {
    const newSection = unit.type === 'heading' && current.length > 0;
    const overflow =
      current.length > 0 &&
      joinedTokens([...current, unit]) > profile.segmentSizeTokens;
    if (newSection || overflow) {
      groups.push(current);
      current = newSection
        ? []
        : fitOverlap(current, unit, profile);
    }
    current = [...current, unit];
  }
  if (current.length) groups.push(current);

  return groups.map((group, position) => {
    const headingPath = headingOf(group);
    const content = group.map((item) => item.text).join('\n\n');
    const contentHash = createHash('sha256').update(content).digest('hex');
    const segmentId = uuidv5(
      `${documentVersionId}:${profile.version}:${position}:${contentHash}`,
    );
    return {
      segmentId,
      parentSegmentId: null,
      content,
      embeddingContent: [
        headingPath.length ? `章节：${headingPath.join(' > ')}` : '',
        `正文：${content}`,
      ]
        .filter(Boolean)
        .join('\n'),
      contentHash,
      headingPath,
      page: pageOf(group),
      position,
      tokenCount: estimateTokens(content),
    };
  });
}

/**
 * 把超过预算的块拆成若干仍带原类型的小块。
 *
 * @param block 解析块。
 * @param profile 段长预算。
 * @returns 未超长时原样返回。
 */
function splitOversizedBlock(
  block: DocumentParsedBlock,
  profile: DocumentSegmentProfile,
) {
  if (estimateTokens(block.text) <= profile.segmentSizeTokens) return [block];
  let parts: string[];
  if (block.type === 'table') {
    parts = splitTableText(block.text, profile.segmentSizeTokens);
  } else if (block.type === 'code') {
    parts = splitLines(block.text, profile.segmentSizeTokens);
  } else {
    parts = piecesUnderLimit(block.text, profile.segmentSizeTokens);
  }
  if (parts.length === 1 && parts[0] === block.text) return [block];
  return parts.map((text, index) => ({
    ...block,
    blockId: uuidv5(`${block.blockId}:${index}`),
    text,
  }));
}

/**
 * 按行分组表格，每组都重复表头。单行放不下时保持整行，不从单元格中间切开。
 *
 * @param text 表格原文，Markdown 或首行是表头的纯文本。
 * @param limit 一组允许的 token 数。
 * @returns 每组一张带表头的表。
 */
function splitTableText(text: string, limit: number) {
  const lines = text.split('\n').filter((line) => line.trim());
  if (lines.length <= 1) return piecesUnderLimit(text, limit);
  const headerSize = isMarkdownSeparator(lines[1] ?? '') ? 2 : 1;
  const header = lines.slice(0, headerSize);
  const data = lines.slice(headerSize);
  if (!data.length) return [lines.join('\n')];
  const groups: string[][] = [];
  let rows: string[] = [];
  for (const row of data) {
    if (rows.length && tableTokens(header, [...rows, row]) > limit) {
      groups.push(rows);
      rows = [];
    }
    rows.push(row);
  }
  if (rows.length) groups.push(rows);
  return groups.map((rows) => [...header, ...rows].join('\n'));
}

/**
 * 按行切代码。只有单行本身超过预算时才按 token 硬切。
 *
 * @param text 代码原文。
 * @param limit 一块允许的 token 数。
 * @returns 代码片段。
 */
function splitLines(text: string, limit: number) {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    const pieces =
      estimateTokens(line) > limit ? hardChunks(line, limit) : [line];
    for (const piece of pieces) {
      const next = [...current, piece];
      if (current.length && estimateTokens(next.join('\n')) > limit) {
        chunks.push(current.join('\n'));
        current = [];
      }
      current.push(piece);
    }
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}

/**
 * 把正文拆到预算以内，优先保留换行和句子。
 *
 * @param text 正文。
 * @param limit 一块允许的 token 数。
 * @returns 按原顺序可拼回的片段。
 */
function piecesUnderLimit(text: string, limit: number): string[] {
  if (estimateTokens(text) <= limit) return [text];
  const separator = TEXT_SEPARATORS.find((item) => text.includes(item));
  if (!separator) return hardChunks(text, limit);
  const parts = splitKeep(text, separator).filter((part) => part.trim());
  if (parts.length <= 1) return hardChunks(text, limit);
  const atomic: string[] = [];
  for (const part of parts) {
    if (estimateTokens(part) <= limit) atomic.push(part);
    else atomic.push(...piecesUnderLimit(part, limit));
  }
  return mergeParts(atomic, limit);
}

/**
 * 把相邻短片段合并，直到再加一段就会超过预算。
 *
 * @param parts 已经各自不超过预算的片段。
 * @param limit 合并后的 token 上限。
 * @returns 合并后的片段。
 */
function mergeParts(parts: string[], limit: number) {
  const merged: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = current + part;
    if (current && estimateTokens(next) > limit) {
      merged.push(current);
      current = part;
      continue;
    }
    current = next;
  }
  if (current) merged.push(current);
  return merged;
}

/**
 * 在分隔符右侧切开，分隔符留在前一段，避免句子标点掉到下一段开头。
 *
 * @param text 原文。
 * @param separator 分隔符。
 * @returns 非空片段。
 */
function splitKeep(text: string, separator: string) {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const found = text.indexOf(separator, start);
    if (found === -1) {
      parts.push(text.slice(start));
      break;
    }
    parts.push(text.slice(start, found + separator.length));
    start = found + separator.length;
  }
  return parts.filter((part) => part.length > 0);
}

/**
 * 按 token 从左到右硬切。只用于没有句子边界、且单行已经超过预算的文本。
 *
 * @param text 原文。
 * @param limit 每段 token 上限。
 * @returns 按顺序的片段。
 */
function hardChunks(text: string, limit: number) {
  const chunks: string[] = [];
  let current = '';
  let tokens = 0;
  for (const char of text) {
    const charTokens = estimateTokens(char);
    if (current && tokens + charTokens > limit) {
      chunks.push(current);
      current = '';
      tokens = 0;
    }
    current += char;
    tokens += charTokens;
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * 取上一段尾部作为重叠，并保证叠上下一段后仍不超过段长。
 *
 * @param previous 已经装好的上一段。
 * @param next 即将放入下一段的块。
 * @param profile 段长和重叠预算。
 * @returns 可以放在下一段开头的块。
 */
function fitOverlap(
  previous: DocumentParsedBlock[],
  next: DocumentParsedBlock,
  profile: DocumentSegmentProfile,
) {
  let budget = profile.overlapTokens;
  let overlap = buildOverlap(previous, budget);
  while (overlap.length && joinedTokens([...overlap, next]) > profile.segmentSizeTokens) {
    budget = Math.floor(budget / 2);
    if (budget < 1) return [];
    overlap = buildOverlap(previous, budget);
  }
  return overlap;
}

/**
 * 从上一段尾部取出不超过预算的块；尾块太大时只保留它的尾部。
 *
 * @param blocks 上一段的块。
 * @param budget 重叠 token 上限。
 * @returns 重叠块。
 */
function buildOverlap(blocks: DocumentParsedBlock[], budget: number) {
  if (budget <= 0) return [];
  const chosen: DocumentParsedBlock[] = [];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;
    const used = joinedTokens(chosen);
    const gap = chosen.length ? estimateTokens('\n\n') : 0;
    const remaining = budget - used - gap;
    if (remaining <= 0) break;
    const candidate = [block, ...chosen];
    if (joinedTokens(candidate) <= budget) {
      chosen.unshift(block);
      continue;
    }
    const text = textSuffix(block.text, remaining, block.type);
    if (text) {
      chosen.unshift({ ...block, text });
    }
    break;
  }
  return chosen;
}

/**
 * 取一块文本的尾部，表格会保留表头。
 *
 * @param text 原文。
 * @param budget 尾部 token 上限。
 * @param type 块类型。
 * @returns 不超过预算的尾部；放不下完整表格行时为空字符串。
 */
function textSuffix(
  text: string,
  budget: number,
  type: DocumentParsedBlock['type'],
) {
  if (budget <= 0) return '';
  if (estimateTokens(text) <= budget) return text;
  if (type === 'table') return tableTail(text, budget);
  if (type === 'code') return lineTail(text, budget);
  return proseTail(text, budget);
}

/**
 * 保留表头，并尽量带上末尾几行。
 *
 * @param text 表格原文。
 * @param budget token 上限。
 * @returns 带表头的尾部；表头本身超过预算时为空字符串。
 */
function tableTail(text: string, budget: number) {
  const lines = text.split('\n').filter((line) => line.trim());
  const headerSize = isMarkdownSeparator(lines[1] ?? '') ? 2 : 1;
  const header = lines.slice(0, headerSize);
  if (estimateTokens(header.join('\n')) > budget) return '';
  const data = lines.slice(headerSize);
  const kept: string[] = [];
  for (let index = data.length - 1; index >= 0; index -= 1) {
    const candidate = [...header, data[index]!, ...kept];
    if (estimateTokens(candidate.join('\n')) > budget) break;
    kept.unshift(data[index]!);
  }
  if (!kept.length) return '';
  return [...header, ...kept].join('\n');
}

/**
 * 从代码末尾保留若干完整行。
 *
 * @param text 代码原文。
 * @param budget token 上限。
 * @returns 尾部代码。
 */
function lineTail(text: string, budget: number) {
  const lines = text.split('\n');
  const kept: string[] = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;
    if (estimateTokens(line) > budget) break;
    const candidate = [line, ...kept];
    if (kept.length && estimateTokens(candidate.join('\n')) > budget) break;
    kept.unshift(line);
  }
  return kept.join('\n');
}

/**
 * 从正文末尾保留若干完整句子。
 *
 * @param text 正文。
 * @param budget token 上限。
 * @returns 尾部正文。
 */
function proseTail(text: string, budget: number) {
  const separator = TEXT_SEPARATORS.find((item) => text.includes(item));
  const parts = separator
    ? splitKeep(text, separator).filter((part) => part.trim())
    : [text];
  const kept: string[] = [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]!;
    if (!kept.length && estimateTokens(part) > budget) return hardSuffix(part, budget);
    const candidate = part + kept.join('');
    if (kept.length && estimateTokens(candidate) > budget) break;
    kept.unshift(part);
  }
  return kept.join('');
}

/**
 * 从文本末尾按 token 截取。
 *
 * @param text 原文。
 * @param budget token 上限。
 * @returns 尾部文本。
 */
function hardSuffix(text: string, budget: number) {
  const chars = Array.from(text);
  const kept: string[] = [];
  let tokens = 0;
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index]!;
    const charTokens = estimateTokens(char);
    if (kept.length && tokens + charTokens > budget) break;
    kept.push(char);
    tokens += charTokens;
  }
  kept.reverse();
  return kept.join('');
}

/**
 * 计算几块拼成一段后的 token。
 *
 * @param blocks 按输出顺序排列的块。
 * @returns 用空行拼接后的 token 数。
 */
function joinedTokens(blocks: DocumentParsedBlock[]) {
  if (!blocks.length) return 0;
  return estimateTokens(blocks.map((block) => block.text).join('\n\n'));
}

/**
 * 计算表头加数据行的 token。
 *
 * @param header 表头行，Markdown 表包含分隔行。
 * @param rows 数据行。
 * @returns 拼成一张表后的 token 数。
 */
function tableTokens(header: string[], rows: string[]) {
  return estimateTokens([...header, ...rows].join('\n'));
}

/**
 * 取这一段最新的标题路径。重叠进来的上一节标题不能盖住当前节。
 *
 * @param blocks 这一段里的块。
 * @returns 从段尾往前看到的第一条标题路径。
 */
function headingOf(blocks: DocumentParsedBlock[]) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const path = blocks[index]?.headingPath ?? [];
    if (path.length) return [...path];
  }
  return [];
}

/**
 * 取这一段最靠近段尾的页码。
 *
 * @param blocks 这一段里的块。
 * @returns 页码；都没有页码时为 null。
 */
function pageOf(blocks: DocumentParsedBlock[]) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const page = blocks[index]?.page;
    if (page !== null && page !== undefined) return page;
  }
  return null;
}

/**
 * 判断是不是 Markdown 表格分隔行。
 *
 * @param line 表格中的一行。
 * @returns `| --- |` 这种行返回 true。
 */
function isMarkdownSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

/**
 * 判断一个字符是否按中文 token 计算。
 *
 * @param char 单个 Unicode 字符。
 * @returns 汉字、假名、谚文、中文标点或全角字符时为 true。
 */
function isCjk(char: string) {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x4e00 && code <= 0x9fff) return true;
  if (code >= 0x3400 && code <= 0x4dbf) return true;
  if (code >= 0x3000 && code <= 0x303f) return true;
  if (code >= 0x3040 && code <= 0x30ff) return true;
  if (code >= 0xac00 && code <= 0xd7af) return true;
  return code >= 0xff00 && code <= 0xffef;
}
