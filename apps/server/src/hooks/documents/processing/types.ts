import type {
  DocumentParsedBlock,
  DocumentSegment,
  FileProcessingTaskDetail,
  FileProcessingTaskInfo,
  FileProcessingTriggerSource,
} from '@repo/types';

/** 创建文件处理任务的输入。 */
export interface CreateFileProcessingTaskInput {
  /** 被处理文件。 */
  fileId: string;
  /** RAG 接入目标知识库。 */
  datasetId: string;
  /** 处理配置组合版本。 */
  processingConfigVersion?: string;
  /** 任务创建来源。 */
  triggerSource?: FileProcessingTriggerSource;
}

/** 文件处理 runner 使用的完整上下文。 */
export interface FileProcessingTaskContext {
  /** 通用任务标识。 */
  taskId: string;
  /** 被处理文件。 */
  fileId: string;
  /** 逻辑文档。 */
  documentId: string;
  /** 本次处理的文档版本。 */
  documentVersionId: string;
  /** 目标知识库。 */
  datasetId: string;
  /** 操作租户与用户。 */
  userId: string;
}

/** 文件处理流水线的中间结果。 */
export interface FileProcessingPipelineResult {
  /** 解析并标准化后的块。 */
  blocks: DocumentParsedBlock[];
  /** 生成的稳定 Segment。 */
  segments: DocumentSegment[];
  /** 解析器版本。 */
  parserVersion: string;
  /** 标准化器版本。 */
  normalizerVersion: string;
  /** Segment 配置版本。 */
  segmentProfileVersion: string;
}

export type {
  FileProcessingTaskDetail,
  FileProcessingTaskInfo,
};

