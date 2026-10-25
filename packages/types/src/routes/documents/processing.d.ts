import type { ApiMultAction } from '../../common/index.js';
import type {
  DocumentTaskOperation,
  TaskAttemptItem,
  TaskItem,
  TaskStatus,
} from '../models.js';

/** 文件处理任务可对外展示的状态。 */
export type FileProcessingTaskStatus = TaskStatus;

/** 文档处理任务持久化的不可变输入。 */
export interface DocumentProcessTaskData {
  /** 同一任务实例选择执行的文档操作。 */
  operations: DocumentTaskOperation[];
  /** 被处理的源文件标识。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 本次处理绑定的不可变文档版本。 */
  documentVersionId: string;
  /** 创建任务的审计用户。 */
  userId: string;
}

/** 文档处理任务成功返回的领域摘要。 */
export interface DocumentProcessResult {
  /** 可选预览结果。 */
  preview?: Record<string, unknown>;
  /** 可选 RAG 结果。 */
  rag?: Record<string, unknown>;
}

/** 文件处理任务详情。 */
export interface FileProcessingTaskDetail extends TaskItem {
  /** 文档处理任务输入。 */
  data: DocumentProcessTaskData;
  /** 文档处理结果摘要。 */
  result: DocumentProcessResult | null;
  /** 通用运行时按序保存的自动执行尝试。 */
  attempts: TaskAttemptItem[];
}

/** 文件处理任务摘要与详情使用同一通用任务模型。 */
export type FileProcessingTaskInfo = FileProcessingTaskDetail;

/** documents 域的文件处理任务接口集合。 */
export type FileProcessingAction = ApiMultAction<{
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
