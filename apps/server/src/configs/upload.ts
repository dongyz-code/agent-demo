import { ROOT } from './env.js';

/** S3 Multipart 规范要求除最后一片外至少为 5 MiB。 */
const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
/** S3 Multipart 最多允许 10,000 个分片。 */
const MAX_PART_COUNT = 10_000;

/** 服务端上传模块使用的完整运行配置。 */
export interface UploadRuntimeConfig {
  /** 服务端内部 S3 Endpoint。 */
  internalEndpoint: string;
  /** 浏览器实际访问的 S3 Endpoint。 */
  publicEndpoint: string;
  /** S3 区域。 */
  region: string;
  /** S3 Access Key。 */
  accessKey: string;
  /** S3 Secret Key。 */
  secretKey: string;
  /** 私有文件 Bucket。 */
  bucket: string;
  /** 预签名 URL 有效秒数。 */
  presignExpiresSeconds: number;
  /** Multipart 切换阈值。 */
  multipartThresholdBytes: number;
  /** Multipart 默认分片字节数。 */
  partSizeBytes: number;
  /** 单文件最大字节数。 */
  maxFileSizeBytes: number;
  /** 单次最大签名分片数量。 */
  maxSignedParts: number;
  /** 上传会话有效秒数。 */
  sessionExpiresSeconds: number;
  /** 未绑定文件保留天数。 */
  unboundRetentionDays: number;
  /** 文本预览最大读取字节数。 */
  maxTextPreviewBytes: number;
  /** Office 预览 Worker 地址。 */
  officePreviewEndpoint?: string;
}

let runtimeConfig: UploadRuntimeConfig | undefined;

/**
 * 读取并校验上传运行配置。
 *
 * @returns 已应用安全默认值的完整配置。
 * @throws 配置缺失、URL 非法或数值越界时抛出启动错误。
 */
export function getUploadRuntimeConfig(): UploadRuntimeConfig {
  if (runtimeConfig) {
    return runtimeConfig;
  }

  const storage = ROOT.storage?.s3;
  if (!storage) {
    throw new Error('系统配置: storage.s3 配置不存在');
  }

  const upload = ROOT.upload ?? {};
  const resolved: UploadRuntimeConfig = {
    internalEndpoint: normalizeEndpoint(
      storage.internalEndpoint,
      'storage.s3.internalEndpoint',
    ),
    publicEndpoint: normalizeEndpoint(
      storage.publicEndpoint,
      'storage.s3.publicEndpoint',
    ),
    region: storage.region?.trim() || 'us-east-1',
    accessKey: requireText(storage.accessKey, 'storage.s3.accessKey'),
    secretKey: requireText(storage.secretKey, 'storage.s3.secretKey'),
    bucket: requireText(storage.bucket, 'storage.s3.bucket'),
    presignExpiresSeconds: positiveInteger(
      upload.presignExpiresSeconds ?? 20 * 60,
      'upload.presignExpiresSeconds',
    ),
    multipartThresholdBytes: positiveInteger(
      upload.multipartThresholdBytes ?? 50 * 1024 * 1024,
      'upload.multipartThresholdBytes',
    ),
    partSizeBytes: positiveInteger(
      upload.partSizeBytes ?? 16 * 1024 * 1024,
      'upload.partSizeBytes',
    ),
    maxFileSizeBytes: positiveInteger(
      upload.maxFileSizeBytes ?? 2 * 1024 * 1024 * 1024,
      'upload.maxFileSizeBytes',
    ),
    maxSignedParts: positiveInteger(
      upload.maxSignedParts ?? 20,
      'upload.maxSignedParts',
    ),
    sessionExpiresSeconds: positiveInteger(
      upload.sessionExpiresSeconds ?? 24 * 60 * 60,
      'upload.sessionExpiresSeconds',
    ),
    unboundRetentionDays: positiveInteger(
      upload.unboundRetentionDays ?? 7,
      'upload.unboundRetentionDays',
    ),
    maxTextPreviewBytes: positiveInteger(
      upload.maxTextPreviewBytes ?? 1024 * 1024,
      'upload.maxTextPreviewBytes',
    ),
    officePreviewEndpoint: upload.officePreviewEndpoint
      ? normalizeEndpoint(
          upload.officePreviewEndpoint,
          'upload.officePreviewEndpoint',
        )
      : undefined,
  };

  if (resolved.partSizeBytes < MIN_PART_SIZE_BYTES) {
    throw new Error('系统配置: upload.partSizeBytes 不能小于 5 MiB');
  }
  if (
    Math.ceil(resolved.maxFileSizeBytes / resolved.partSizeBytes) >
    MAX_PART_COUNT
  ) {
    throw new Error('系统配置: 最大文件与分片大小组合超过 10,000 个分片');
  }
  if (resolved.multipartThresholdBytes > resolved.maxFileSizeBytes) {
    throw new Error('系统配置: Multipart 阈值不能大于单文件上限');
  }

  runtimeConfig = resolved;
  return resolved;
}

/** 启动阶段执行上传配置校验，使错误在开放接口前暴露。 */
export function validateUploadRuntimeConfig(): void {
  getUploadRuntimeConfig();
}

/** 读取非空配置文本。 */
function requireText(value: string, key: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`系统配置: ${key} 不能为空`);
  }
  return normalized;
}

/** 校验并移除 Endpoint 末尾斜杠，避免签名 Host/Path 不一致。 */
function normalizeEndpoint(value: string, key: string): string {
  const normalized = requireText(value, key).replace(/\/+$/, '');
  const url = new URL(normalized);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`系统配置: ${key} 仅支持 HTTP/HTTPS`);
  }
  return url.toString().replace(/\/+$/, '');
}

/** 校验必须为正整数的上传配置。 */
function positiveInteger(value: number, key: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`系统配置: ${key} 必须为正整数`);
  }
  return value;
}
