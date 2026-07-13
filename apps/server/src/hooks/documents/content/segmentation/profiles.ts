import { getDocumentRuntimeConfig } from '@/configs/index.js';

import type { DocumentSegmentProfile } from '../types.js';

/** 返回默认结构化 Segment 配置。 */
export function getDefaultSegmentProfile(): DocumentSegmentProfile {
  const config = getDocumentRuntimeConfig();
  return {
    version: `structure-v1-${config.segmentSizeTokens}-${config.segmentOverlapTokens}`,
    segmentSizeTokens: config.segmentSizeTokens,
    overlapTokens: config.segmentOverlapTokens,
  };
}
