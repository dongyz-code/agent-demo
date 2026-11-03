/** upload 提供的稳定文件句柄，不包含物理路径，也不代表访问授权。 */
export type FileKey = string;

/** 服务端注册的文件用途；preview 仅供可信服务端生成产物。 */
export type FilePurpose = 'attachment' | 'document' | 'avatar' | 'preview';

/** 文件上传传输模式。 */
export type UploadMode = 'single' | 'multipart';

/** 上传会话状态；completed 不表达业务绑定结果。 */
export type UploadSessionStatus =
  | 'initialized'
  | 'uploading'
  | 'completing'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'expired';

/** 文件可信状态，只有 verified 文件可以被业务读取或绑定。 */
export type StoredFileStatus = 'pending' | 'verified' | 'rejected';

/** 已验证的文件描述，业务只需持久化 key。 */
export interface UploadedFile {
  /** 稳定文件句柄，与内部 files.file_id 对应。 */
  key: FileKey;
  /** 已清洗的原始文件名。 */
  filename: string;
  /** 规范化且不含点的扩展名。 */
  extension: string;
  /** 服务端验证后的可信 MIME。 */
  contentType: string;
  /** 服务端验证后的字节数。 */
  size: number;
  /** 上传时冻结的用途，供业务绑定时检查。 */
  purpose: FilePurpose;
}

/** 文件短期访问结果，不应作为持久文件引用保存。 */
export interface FileAccess {
  /** 受有效期约束的访问地址。 */
  url: string;
  /** 地址失效时间。 */
  expiresAt: Date;
}

/** 已上传分片信息，以对象存储 ListParts 结果为事实来源。 */
export interface UploadedPartInfo {
  /** 从 1 开始的分片编号。 */
  partNumber: number;
  /** 对象存储返回的 ETag，不能当作完整文件摘要。 */
  etag: string;
  /** 分片字节数。 */
  size: number;
}
