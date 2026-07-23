import { createHash } from 'node:crypto';

import type { DocumentSegment, DocumentParsedBlock } from '@repo/types';
import type { DocumentSegmentProfile } from './types.js';
import { hashToUuid } from './ids.js';

/**
 * 将标准化块按结构和 token 预算切分为确定性 Segment。
 *
 * @param documentVersionId 文档版本标识。
 * @param blocks 标准化解析块。
 * @param profile Segment 配置版本。
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
  let currentTokens = 0;

  for (const unit of units) {
    const tokens = estimateTokens(unit.text);
    if (current.length && currentTokens + tokens > profile.segmentSizeTokens) {
      groups.push(current);
      current = buildOverlap(current, profile.overlapTokens);
      currentTokens = current.reduce(
        (sum, item) => sum + estimateTokens(item.text),
        0,
      );
    }
    current.push(unit);
    currentTokens += tokens;
  }
  if (current.length) {
    groups.push(current);
  }

  return groups.map((group, position) => {
    const headingPath = group.find((item) => item.headingPath.length)?.headingPath ?? [];
    const content = group.map((item) => item.text).join('\n\n');
    const contentHash = createHash('sha256').update(content).digest('hex');
    const segmentId = hashToUuid(
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
      page: group.find((item) => item.page !== null)?.page ?? null,
      position,
      tokenCount: estimateTokens(content),
    };
  });
}

/** 将单个超长块按字符近似 token 边界切开。 */
function splitOversizedBlock(
  block: DocumentParsedBlock,
  profile: DocumentSegmentProfile,
) {
  if (estimateTokens(block.text) <= profile.segmentSizeTokens) {
    return [block];
  }
  const charsPerSegment = profile.segmentSizeTokens * 4;
  const overlapChars = profile.overlapTokens * 4;
  const result: DocumentParsedBlock[] = [];
  for (
    let start = 0, index = 0;
    start < block.text.length;
    start += Math.max(1, charsPerSegment - overlapChars), index++
  ) {
    result.push({
      ...block,
      blockId: hashToUuid(`${block.blockId}:${index}`),
      text: block.text.slice(start, start + charsPerSegment),
    });
  }
  return result;
}

/** 从上一 Segment 尾部保留不超过指定 token 的完整块。 */
function buildOverlap(blocks: DocumentParsedBlock[], overlapTokens: number) {
  const result: DocumentParsedBlock[] = [];
  let tokens = 0;
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index]!;
    const blockTokens = estimateTokens(block.text);
    if (result.length && tokens + blockTokens > overlapTokens) {
      break;
    }
    result.unshift(block);
    tokens += blockTokens;
    if (tokens >= overlapTokens) {
      break;
    }
  }
  return result;
}

/** 使用字符数近似 token，后续可在不改变接口的情况下替换模型 tokenizer。 */
function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
