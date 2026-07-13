import type { ApiMultAction } from '../../common/index.js';

/** 服务端注册的通用上传策略。 */
export type UploadPolicyKey =
  | 'default-attachment'
  | 'image'
  | 'rag-document';

/** 文件上传传输模式。 */
export type UploadMode = 'single' | 'multipart';

/** 上传会话状态。 */
export type UploadSessionStatus =
  | 'initialized'
  | 'uploading'
  | 'completing'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'expired';

/** 通用文件可信状态。 */
export type StoredFileStatus =
  | 'pending'
  | 'verifying'
  | 'verified'
  | 'rejected'
  | 'deleting'
  | 'deleted';

/** 预览派生物处理状态。 */
export type FileVariantStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed';

/** 通用文件派生物类型。 */
export type FileVariantType =
  | 'thumbnail'
  | 'preview-pdf'
  | 'preview-html'
  | 'extracted-text';

/** 通用文件领域稳定错误码。 */
export type UploadErrorCode =
  | 'UPLOAD_INVALID_POLICY'
  | 'UPLOAD_FILE_TOO_LARGE'
  | 'UPLOAD_FILE_TYPE_NOT_ALLOWED'
  | 'UPLOAD_SESSION_NOT_FOUND'
  | 'UPLOAD_SESSION_EXPIRED'
  | 'UPLOAD_SESSION_STATE_CONFLICT'
  | 'UPLOAD_PART_INVALID'
  | 'UPLOAD_OBJECT_MISMATCH'
  | 'UPLOAD_FILE_REJECTED'
  | 'UPLOAD_FILE_FORBIDDEN'
  | 'UPLOAD_FILE_IN_USE'
  | 'UPLOAD_STORAGE_UNAVAILABLE';

/** 对外返回的通用文件信息，不包含 Bucket、Object Key 和存储凭证。 */
export interface StoredFileInfo {
  /** 文件稳定标识。 */
  fileId: string;
  /** 用户上传时的显示名称。 */
  filename: string;
  /** 服务端验证后的可信 MIME。 */
  contentType: string;
  /** 文件字节数。 */
  size: number;
  /** 服务端计算的 SHA-256；严格验证完成前为空。 */
  sha256: string | null;
  /** 文件可信状态。 */
  status: StoredFileStatus;
  /** 创建时间。 */
  createdAt: Date;
}

/** 已上传分片信息，以对象存储 ListParts 结果为事实来源。 */
export interface UploadedPartInfo {
  /** 从 1 开始的分片编号。 */
  partNumber: number;
  /** 对象存储返回的 ETag。 */
  etag: string;
  /** 分片字节数。 */
  size: number;
}

/** 上传会话管理信息。 */
export interface UploadSessionInfo {
  /** 上传会话标识。 */
  sessionId: string;
  /** 初始化时创建的通用文件标识。 */
  fileId: string;
  /** 服务端上传策略。 */
  policyKey: UploadPolicyKey;
  /** 文件验证成功后是否自动创建 RAG 接入任务。 */
  enterRag: boolean;
  /** 自动处理使用的目标知识库。 */
  datasetId: string | null;
  /** 自动处理使用的配置组合版本。 */
  processingConfigVersion: string | null;
  /** 当前传输模式。 */
  mode: UploadMode;
  /** 当前会话状态。 */
  status: UploadSessionStatus;
  /** 文件显示名称。 */
  filename: string;
  /** 声明的文件字节数。 */
  size: number;
  /** Multipart 分片字节数；普通上传为空。 */
  partSize: number | null;
  /** Multipart 分片总数；普通上传为空。 */
  partCount: number | null;
  /** 已由 MinIO 确认的上传字节数。 */
  uploadedSize: number;
  /** 会话过期时间。 */
  expiresAt: Date;
  /** 稳定错误码。 */
  errorCode: UploadErrorCode | null;
  /** 面向管理端的错误说明。 */
  errorMessage: string | null;
}

/** 上传接口集合。 */
export type Upload = ApiMultAction<{
  init: {
    body: {
      /** 服务端注册的上传策略键。 */
      policyKey: UploadPolicyKey;
      /** 原始文件名。 */
      filename: string;
      /** 浏览器声明 MIME，仅用于前置判断。 */
      contentType: string;
      /** 文件字节数。 */
      size: number;
      /** 客户端文件指纹，用于刷新后匹配会话。 */
      fingerprint: string;
      /** 客户端请求幂等键。 */
      idempotencyKey: string;
      /** 文件验证成功后是否自动进入 RAG 接入流程。 */
      enterRag?: boolean;
      /** 自动处理使用的目标知识库。 */
      datasetId?: string;
      /** 自动处理使用的配置组合版本。 */
      processingConfigVersion?: string;
    };
    resp:
      | {
          mode: 'single';
          session: UploadSessionInfo;
          uploadUrl: string;
          headers: Record<string, string>;
          expiresAt: Date;
        }
      | {
          mode: 'multipart';
          session: UploadSessionInfo;
          uploadId: string;
          partSize: number;
          partCount: number;
        };
  };
  'sign-parts': {
    body: {
      /** 上传会话标识。 */
      sessionId: string;
      /** 需要签名的分片编号。 */
      partNumbers: number[];
    };
    resp: {
      parts: {
        partNumber: number;
        uploadUrl: string;
        expiresAt: Date;
      }[];
    };
  };
  'list-parts': {
    body: { sessionId: string };
    resp: {
      parts: UploadedPartInfo[];
      uploadedSize: number;
      missingPartNumbers: number[];
    };
  };
  complete: {
    body: {
      sessionId: string;
      /** Multipart 模式需要提交的分片清单；普通上传省略。 */
      parts?: Pick<UploadedPartInfo, 'partNumber' | 'etag'>[];
    };
    resp: StoredFileInfo;
  };
  abort: {
    body: { sessionId: string };
    resp: 'ok';
  };
  status: {
    body: { sessionId: string };
    resp: UploadSessionInfo;
  };
  list: {
    body: {
      status?: UploadSessionStatus[];
      policyKey?: UploadPolicyKey[];
      limit?: number[];
      withCount?: boolean;
    };
    resp: { list: UploadSessionInfo[]; count: number };
  };
}>;
