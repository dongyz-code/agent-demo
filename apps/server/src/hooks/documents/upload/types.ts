import type { Readable } from 'node:stream';
import type {
  FilePreviewDescriptor,
  StoredFileInfo,
  UploadPolicyKey,
} from '@repo/types';

/** 服务端注册的上传策略。 */
export interface UploadPolicy {
  /** 策略稳定键。 */
  key: UploadPolicyKey;
  /** 允许的可信 MIME 集合。 */
  allowedContentTypes: readonly string[];
  /** 允许的扩展名集合，不包含点。 */
  allowedExtensions: readonly string[];
  /** 策略允许的最大文件字节数。 */
  maxFileSizeBytes: number;
  /** 达到该字节数后使用 Multipart。 */
  multipartThresholdBytes: number;
  /** 默认 Multipart 分片字节数。 */
  partSizeBytes: number;
  /** 是否在验证成功后创建预览任务。 */
  previewEnabled: boolean;
  /** 未绑定文件的保留天数。 */
  unboundRetentionDays: number;
}

/** 仅服务端内部使用的对象定位。 */
export interface StoredObjectLocation {
  /** 私有 Bucket。 */
  bucket: string;
  /** 服务端生成的对象路径。 */
  objectKey: string;
}

/** RAG 等业务模块读取文件时使用的稳定描述。 */
export interface ReadableStoredFile extends StoredFileInfo {
  /** 每次调用均重新打开对象流，避免重试复用已消费流。 */
  openStream: () => Promise<Readable>;
}

/** 文件引用输入；namespace、ownerId 和 role 对上传模块均为不透明文本。 */
export interface BindFileInput {
  /** 被引用文件。 */
  fileId: string;
  /** 业务命名空间。 */
  namespace: string;
  /** 业务资源标识。 */
  ownerId: string;
  /** 文件业务角色。 */
  role: string;
}

/** 通用预览服务公共返回类型。 */
export type UploadFilePreview = FilePreviewDescriptor;
