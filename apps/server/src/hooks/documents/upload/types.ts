import type {
  FilePreviewDescriptor,
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

/** 通用预览服务公共返回类型。 */
export type UploadFilePreview = FilePreviewDescriptor;
