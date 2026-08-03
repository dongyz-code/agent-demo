import type { ApiMultAction } from '../../common/index.js';

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
  | 'verified'
  | 'rejected';

/** 已上传分片信息，以对象存储 ListParts 结果为事实来源。 */
export interface UploadedPartInfo {
  /** 从 1 开始的分片编号。 */
  partNumber: number;
  /** 对象存储返回的 ETag。 */
  etag: string;
  /** 分片字节数。 */
  size: number;
}

/** 文档上传完成后的业务结果。 */
export interface DocumentUploadResult {
  /** 新建或新增版本所属的文档。 */
  documentId: string;
  /** 新建或复用的文档版本。 */
  documentVersionId: string;
  /** 文档内递增版本号。 */
  version: number;
  /** 本次请求是否创建了新版本。 */
  created: boolean;
}

/** documents 域的上传接口集合。 */
export type Upload = ApiMultAction<{
  init: {
    body: {
      /** 原始文件名。 */
      filename: string;
      /** 浏览器声明 MIME，仅用于前置判断。 */
      contentType: string;
      /** 文件字节数。 */
      size: number;
      /** 客户端请求幂等键。 */
      idempotencyKey: string;
      /** 已有文档标识；提供时表示上传新版本。 */
      documentId?: string;
    };
    resp:
      | {
          /** 既有会话已完成，只允许客户端取回文档版本结果。 */
          mode: 'completed';
          /** 服务端上传会话标识。 */
          sessionId: string;
        }
      | {
          mode: 'single';
          sessionId: string;
          uploadUrl: string;
          headers: Record<string, string>;
        }
      | {
          mode: 'multipart';
          sessionId: string;
          partSize: number;
        };
  };
  'sign-parts': {
    body: {
      /** 上传会话标识。 */
      sessionId: string;
      /** 需要签名的分片编号。 */
      partNumber: number;
    };
    resp: {
      uploadUrl: string;
    };
  };
  'list-parts': {
    body: { sessionId: string };
    resp: { parts: UploadedPartInfo[] };
  };
  complete: {
    body: { sessionId: string };
    resp: DocumentUploadResult;
  };
  abort: {
    body: { sessionId: string };
    resp: 'ok';
  };
  status: {
    body: { sessionId: string };
    resp: { status: UploadSessionStatus };
  };
}>;
