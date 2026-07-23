import { ROOT } from '@/configs/index.js';

import type { DocumentSegmentProfile } from './pipeline/types.js';

/** 首期文档预处理与 RAG 接入配置版本。 */
export const DEFAULT_FILE_PROCESSING_CONFIG_VERSION = 'file-processing-v1';

/**
 * 返回当前服务配置对应的默认 Segment 策略。
 *
 * @returns 包含稳定版本、目标 token 数和重叠 token 数的策略。
 */
export function getDefaultSegmentProfile(): DocumentSegmentProfile {
  const config = ROOT.document;
  return {
    version: `structure-v1-${config.segmentSizeTokens}-${config.segmentOverlapTokens}`,
    segmentSizeTokens: config.segmentSizeTokens,
    overlapTokens: config.segmentOverlapTokens,
  };
}
