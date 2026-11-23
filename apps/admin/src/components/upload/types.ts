import type { DocumentUploadResult, UploadedFile, UploadMode } from '@/types';

/** 打开文档上传流程的业务上下文；新版本不允许变更资料库。 */
export interface DocumentUploadTarget {
  /** 已有文档标识，传入时只接收一份新版本文件。 */
  documentId?: string;
  /** 新建文档时的预选资料库，弹窗会重新核对管理资格。 */
  libraryId?: string;
}

/** Uppy 文件上保存的通用上传会话元数据。 */
export interface UploadFileMeta extends Record<string, unknown> {
  /** 当前浏览器选择生成的上传尝试标识；新选择和终态重传必须不同。 */
  uploadAttemptId?: string;
  /** 首次初始化时冻结的业务目标，仅由文档绑定接口使用。 */
  documentId?: string | null;
  /** 新建文档所属资料库。 */
  libraryId?: string | null;
  /** 服务端上传会话标识。 */
  sessionId?: string;
  /** 服务端选择的传输模式。 */
  mode?: UploadMode;
  /** Multipart 分片大小。 */
  partSize?: number;
  /** 普通上传预签名地址。 */
  uploadUrl?: string;
  /** 普通上传要求携带的请求头。 */
  uploadHeaders?: Record<string, string>;
  /** 当前文件在管理端展示的上传阶段。 */
  stage?: UploadQueueStage;
  /** 当前错误是否允许在不重新选择文件的情况下重试。 */
  retryable?: boolean;
  /** 重试前是否必须丢弃终态服务端会话并生成新的上传尝试。 */
  restartRequired?: boolean;
  /** 是否由浏览器持久化数据恢复。 */
  restored?: boolean;
  /** 文件验证成功后的句柄；绑定失败仍保留，重试时不重新上传。 */
  uploadedFile?: UploadedFile;
  /** 对象已完成验证并绑定文档后保存的业务结果。 */
  storedFile?: DocumentUploadResult;
}

/** 管理端上传队列的用户可见阶段。 */
export type UploadQueueStage =
  | 'waiting'
  | 'initializing'
  | 'uploading'
  | 'paused'
  | 'confirming'
  | 'binding'
  | 'complete'
  | 'failed';

/** 管理端上传完成响应体。 */
export interface UploadResponseBody extends Record<string, unknown> {
  /** 服务端完成验证和文档绑定后的结果。 */
  file?: DocumentUploadResult;
  /** Uppy 兼容的可选位置字段，不作为业务访问地址。 */
  location?: string;
}

/** 上传队列展示项。 */
export interface UploadQueueItem {
  /** Uppy 文件标识。 */
  id: string;
  /** 文件加入队列时冻结的资料库，避免恢复上传时误显示为另一个库。 */
  libraryId?: string | null;
  /** 文件显示名称。 */
  name: string;
  /** 文件字节数。 */
  size: number;
  /** 0 到 100 的上传进度。 */
  progress: number;
  /** 当前真实上传阶段。 */
  stage: UploadQueueStage;
  /** 是否为刷新后恢复的服务端上传任务。 */
  restored: boolean;
  /** 当前错误是否允许直接重试。 */
  retryable: boolean;
  /** 上传或验证错误。 */
  error: string | null;
  /** 完成后的文档版本绑定结果。 */
  storedFile?: DocumentUploadResult;
}

/** 通用上传器创建参数。 */
export interface UploaderOptions {
  /** 上传器持久化空间的稳定用途键，用于隔离不同文档上传队列。 */
  instanceKey: string;
  /** 单次队列最多允许加入的文件数。 */
  maxNumberOfFiles?: number;
  /** 每次初始化上传会话时读取最新的目标文档；空值表示新建文档。 */
  getDocumentId?: () => string | undefined;
  /** 新建文档时读取所属资料库。 */
  getLibraryId?: () => string | undefined;
  /** 文档版本创建后的业务回调；Promise 完成前队列项不会标记成功。 */
  onUploaded?: (result: DocumentUploadResult) => void | Promise<void>;
}
