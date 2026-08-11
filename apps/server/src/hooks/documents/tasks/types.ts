import type {
  DocumentTaskOperation,
  FileProcessingTriggerSource,
} from '@repo/types';

/** 文档 RAG 或预览任务的数据快照。 */
export interface DocumentFileTaskData {
  /** 同一任务实例选择执行的文档操作。 */
  operations: DocumentTaskOperation[];
  /** 被处理的源文件标识。 */
  fileId: string;
  /** 逻辑文档标识。 */
  documentId: string;
  /** 本次处理绑定的不可变文档版本。 */
  documentVersionId: string;
  /** 上传、人工、重试或重新执行。 */
  triggerSource: FileProcessingTriggerSource;
  /** 各处理操作对应的配置版本。 */
  operationConfigVersions: Partial<Record<DocumentTaskOperation, string>>;
  /** 创建任务的审计用户。 */
  userId: string;
}

/** 文档逻辑删除后的物理清理任务数据。 */
export interface DocumentCleanupTaskData {
  /** 清理必须独占整个任务实例。 */
  operations: ['cleanup'];
  /** 被逻辑删除的文档标识。 */
  documentId: string;
  /** 发起删除的审计用户。 */
  userId: string;
}

/** documents 域唯一脚本接受的判别式数据。 */
export type DocumentTaskData = DocumentFileTaskData | DocumentCleanupTaskData;

/** 创建文档版本处理任务时由业务方提供的输入。 */
export interface AddDocumentProcessingTaskInput {
  /** 逻辑文档标识。 */
  documentId: string;
  /** 可选历史版本；为空时使用当前版本。 */
  documentVersionId?: string;
  /** 需要执行的 RAG 或预览操作。 */
  operations: DocumentTaskOperation[];
  /** 上传、人工、重试或重新执行。 */
  triggerSource?: FileProcessingTriggerSource;
  /** 可选 RAG 处理配置；未提供时使用当前默认配置。 */
  ragConfigVersion?: string;
}

/** 创建文档物理清理任务时由业务方提供的输入。 */
export interface AddDocumentCleanupTaskInput {
  /** 被逻辑删除的文档标识。 */
  documentId: string;
  /** 清理操作必须独占任务。 */
  operations: ['cleanup'];
}

/** `addDocumentTask` 接受的版本处理或物理清理输入。 */
export type AddDocumentTaskInput =
  | AddDocumentProcessingTaskInput
  | AddDocumentCleanupTaskInput;
