import { documentsConfig } from '../../config.js';

import type { DocumentSegmentProfile } from './types.js';

/** 当前文档内容处理配置；v2 表示远程文档统一使用 TextIn xParse 异步解析。 */
export const DEFAULT_DOCUMENT_CONTENT_CONFIG_VERSION = 'document-content-v2';

/**
 * 返回当前服务配置对应的默认 Segment 策略。
 *
 * @returns 包含稳定版本、目标 token 数和重叠 token 数的策略。
 */
export function getDefaultSegmentProfile(): DocumentSegmentProfile {
  const config = documentsConfig.document;
  return {
    version: `structure-v1-${config.segmentSizeTokens}-${config.segmentOverlapTokens}`,
    segmentSizeTokens: config.segmentSizeTokens,
    overlapTokens: config.segmentOverlapTokens,
  };
}
