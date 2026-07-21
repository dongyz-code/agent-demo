import { ROOT } from '@/configs/index.js';

import type { FileProcessingStage } from '@repo/types';
import type { DocumentSegmentProfile } from './pipeline/types.js';

/** 统一任务主表使用的文件处理任务键。 */
export const FILE_PROCESSING_TASK_KEY = 'file-processing';
/** 首期文件预处理与 RAG 接入配置版本。 */
export const DEFAULT_FILE_PROCESSING_CONFIG_VERSION = 'file-processing-v1';
/** 标准化器版本，处理规则变化时必须递增。 */
export const NORMALIZER_VERSION = 'normalizer-v1';

/** 文件处理阶段对应的完成进度。 */
export const FILE_PROCESSING_STAGE_PROGRESS: Record<
  FileProcessingStage,
  number
> = {
  queued: 0,
  reading: 10,
  parsing: 30,
  normalizing: 50,
  segmenting: 80,
  'rag-ingestion': 95,
  completed: 100,
};

/** 返回默认结构化 Segment 配置。 */
export function getDefaultSegmentProfile(): DocumentSegmentProfile {
  const config = ROOT.document;
  return {
    version: `structure-v1-${config.segmentSizeTokens}-${config.segmentOverlapTokens}`,
    segmentSizeTokens: config.segmentSizeTokens,
    overlapTokens: config.segmentOverlapTokens,
  };
}
