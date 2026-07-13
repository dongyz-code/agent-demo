import type { FileProcessingStage } from '@repo/types';

/** 统一任务主表使用的文件处理任务键。 */
export const FILE_PROCESSING_TASK_KEY = 'file-processing';
/** 首期文件预处理与 RAG 接入配置版本。 */
export const DEFAULT_FILE_PROCESSING_CONFIG_VERSION = 'file-processing-v1';

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

/** 文件处理 runner 按该顺序执行阶段。 */
export const FILE_PROCESSING_STAGES: readonly FileProcessingStage[] = [
  'reading',
  'parsing',
  'normalizing',
  'segmenting',
  'rag-ingestion',
];

