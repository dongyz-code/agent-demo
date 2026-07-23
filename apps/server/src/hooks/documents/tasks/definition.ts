import type { FileProcessingStage } from '@repo/types';

/** 统一任务主表使用的文档处理任务键。 */
export const FILE_PROCESSING_TASK_KEY = 'file-processing';
/** 文档逻辑删除后使用的幂等清理任务键。 */
export const DOCUMENT_CLEANUP_TASK_KEY = 'document-cleanup';
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
  'content-publishing': 95,
  'preview-converting': 70,
  'preview-publishing': 90,
  completed: 100,
};
