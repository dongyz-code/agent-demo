import type { StoredFileInfo, UploadMode, UploadPolicyKey } from '@/types';

/** Uppy 文件上保存的通用上传会话元数据。 */
export interface UploadFileMeta extends Record<string, unknown> {
  /** 服务端上传会话标识。 */
  sessionId?: string;
  /** 初始化得到的文件标识。 */
  fileId?: string;
  /** 服务端选择的传输模式。 */
  mode?: UploadMode;
  /** Multipart 上传标识，仅在插件内部透传。 */
  uploadId?: string;
  /** Multipart 分片大小。 */
  partSize?: number;
  /** 普通上传预签名地址。 */
  uploadUrl?: string;
  /** 普通上传要求携带的请求头。 */
  uploadHeaders?: Record<string, string>;
  /** 刷新后可复用的稳定文件指纹。 */
  fingerprint?: string;
  /** 对象已完成服务端验证、但业务回调可能尚未成功时保存的文件。 */
  storedFile?: StoredFileInfo;
}

/** 管理端上传完成响应体。 */
export interface UploadResponseBody extends Record<string, unknown> {
  /** 服务端完成验证后的通用文件。 */
  file?: StoredFileInfo;
  /** Uppy 兼容的可选位置字段，不作为业务访问地址。 */
  location?: string;
}

/** 上传队列展示项。 */
export interface UploadQueueItem {
  /** Uppy 文件标识。 */
  id: string;
  /** 文件显示名称。 */
  name: string;
  /** 文件字节数。 */
  size: number;
  /** 0 到 100 的上传进度。 */
  progress: number;
  /** 是否处于暂停状态。 */
  paused: boolean;
  /** 是否完成对象上传和服务端验证。 */
  complete: boolean;
  /** 上传或验证错误。 */
  error: string | null;
  /** 完成后的通用文件。 */
  storedFile?: StoredFileInfo;
}

/** 通用上传器创建参数。 */
export interface UploaderOptions {
  /** 服务端注册的上传策略。 */
  policyKey: UploadPolicyKey;
  /** 单次队列最多允许加入的文件数。 */
  maxNumberOfFiles?: number;
  /** 每次初始化上传会话时读取最新的文件处理意图。 */
  getProcessingIntent?: () => {
    /** 文件验证成功后是否自动进入 RAG。 */
    enterRag: boolean;
    /** 自动处理使用的目标知识库。 */
    datasetId?: string;
  };
  /** 文件完成验证后的业务回调；Promise 完成前队列项不会标记成功。 */
  onUploaded?: (file: StoredFileInfo) => void | Promise<void>;
}
