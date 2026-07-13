import type { ApiMultAction } from '../../common/index.js';
import type {
  FileProcessingStage,
  FileProcessingTriggerSource,
  TaskStatus,
} from '../models.js';

/** 文件处理任务可对外展示的状态。 */
export type FileProcessingTaskStatus = Extract<
  TaskStatus,
  'to-be-started' | 'pending' | 'completed' | 'failed' | 'killed'
>;

/** 文件处理阶段执行记录。 */
export interface FileProcessingStageRunInfo {
  /** 当前阶段。 */
  stage: FileProcessingStage;
  /** 同一阶段的尝试序号。 */
  attempt: number;
  /** 阶段执行状态。 */
  status: FileProcessingTaskStatus;
  /** 阶段处理数量。 */
  processedItems: number;
  /** 阶段总数量。 */
  totalItems: number;
  /** 稳定错误码。 */
  errorCode: string | null;
  /** 安全错误摘要。 */
  errorMessage: string | null;
  /** 阶段开始时间。 */
  startedAt: Date;
  /** 阶段结束时间。 */
  endedAt: Date | null;
}

/** 文件处理任务摘要。 */
export interface FileProcessingTaskInfo {
  /** 通用任务标识。 */
  taskId: string;
  /** 被处理文件标识。 */
  fileId: string;
  /** 文件显示名称。 */
  filename: string;
  /** 目标知识库标识。 */
  datasetId: string | null;
  /** 目标知识库名称。 */
  datasetName: string | null;
  /** 同一文件的执行序号。 */
  executionNo: number;
  /** 任务创建来源。 */
  triggerSource: FileProcessingTriggerSource;
  /** 当前任务状态。 */
  status: FileProcessingTaskStatus;
  /** 当前执行阶段。 */
  stage: FileProcessingStage;
  /** 整数进度。 */
  progress: number;
  /** 已处理项目数量。 */
  processedItems: number;
  /** 待处理项目总数。 */
  totalItems: number;
  /** 稳定错误码。 */
  errorCode: string | null;
  /** 安全错误摘要。 */
  errorMessage: string | null;
  /** 是否允许基于本次记录创建新任务。 */
  retryable: boolean;
  /** 任务创建时间。 */
  createdAt: Date;
  /** 任务开始时间。 */
  startedAt: Date | null;
  /** 任务结束时间。 */
  endedAt: Date | null;
}

/** 文件处理任务详情。 */
export interface FileProcessingTaskDetail extends FileProcessingTaskInfo {
  /** 处理配置组合版本。 */
  processingConfigVersion: string;
  /** 任务结果摘要。 */
  resultSummary: Record<string, unknown> | null;
  /** 阶段执行时间线。 */
  stageRuns: FileProcessingStageRunInfo[];
}

/** 文件处理任务接口集合。 */
export type FileProcessingAction = ApiMultAction<{
  create: {
    body: {
      /** 被处理文件。 */
      fileId: string;
      /** 目标知识库。 */
      datasetId: string;
      /** 处理配置组合版本；未传时使用当前默认版本。 */
      processingConfigVersion?: string;
    };
    resp: FileProcessingTaskInfo;
  };
  detail: {
    body: { taskId: string };
    resp: FileProcessingTaskDetail;
  };
  cancel: {
    body: { taskId: string };
    resp: 'ok';
  };
  retry: {
    body: { taskId: string };
    resp: FileProcessingTaskInfo;
  };
}>;

