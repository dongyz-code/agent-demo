import { createHash } from 'node:crypto';

import type { DocumentParsedBlock } from '@repo/types';

/** 将任意稳定文本摘要转换为符合 UUID 格式的确定性标识。 */
export function hashToUuid(value: string) {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  const versioned = `${digest.slice(0, 12)}5${digest.slice(13, 16)}8${digest.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}

/** 将解析块标识收口为文档版本和解析器版本相关的稳定 UUID。 */
export function stableParsedBlockId(
  documentVersionId: string,
  parserVersion: string,
  block: DocumentParsedBlock,
) {
  return hashToUuid(
    `${documentVersionId}:${parserVersion}:${block.blockId}:${block.position}`,
  );
}

/** 从带前缀错误消息提取稳定错误码；无法提取时返回兜底码。 */
export function getErrorCode(message: string, fallback: string) {
  const match = /^([A-Z0-9_]+):/.exec(message);
  return match?.[1] ?? fallback;
}
