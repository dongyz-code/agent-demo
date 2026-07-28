import type { UploadPolicyKey } from '@/types';

/** 管理端用于即时反馈的上传策略镜像；服务端仍是最终安全边界。 */
export interface ClientUploadPolicy {
  /** 文件 input 使用的扩展名白名单。 */
  accept: string;
  /** 允许的浏览器 MIME 集合。 */
  allowedContentTypes: ReadonlySet<string>;
  /** 允许的不带点小写扩展名集合。 */
  allowedExtensions: ReadonlySet<string>;
  /** 单文件最大字节数。 */
  maxFileSizeBytes: number;
}

/** 浏览器未提供可靠 MIME 时按扩展名补齐上传声明。 */
const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
};

/** 文档管理单文件上限，与服务端当前配置的 2 GiB 保持一致。 */
const DOCUMENT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

/** 当前管理端可选择的上传策略镜像。 */
const CLIENT_UPLOAD_POLICIES: Record<UploadPolicyKey, ClientUploadPolicy> = {
  'default-attachment': createPolicy([
    'jpg',
    'jpeg',
    'png',
    'webp',
    'pdf',
    'docx',
    'pptx',
    'xlsx',
    'txt',
    'md',
    'csv',
  ]),
  image: createPolicy(['jpg', 'jpeg', 'png', 'webp'], 50 * 1024 * 1024),
  'rag-document': createPolicy(['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'csv']),
};

/**
 * 创建单个客户端策略镜像。
 *
 * @param extensions 允许的不带点扩展名。
 * @param maxFileSizeBytes 单文件最大字节数，默认使用文档上限。
 * @returns 可供 input、Uppy 和手工校验共同使用的策略。
 */
function createPolicy(
  extensions: string[],
  maxFileSizeBytes = DOCUMENT_MAX_FILE_SIZE_BYTES,
): ClientUploadPolicy {
  const allowedContentTypes = new Set<string>();
  for (const extension of extensions) {
    const contentType = CONTENT_TYPE_BY_EXTENSION[extension];
    if (contentType) allowedContentTypes.add(contentType);
  }
  return {
    accept: extensions.map((extension) => `.${extension}`).join(','),
    allowedContentTypes,
    allowedExtensions: new Set(extensions),
    maxFileSizeBytes,
  };
}

/**
 * 读取管理端即时校验使用的上传策略。
 *
 * @param policyKey 服务端策略稳定键。
 * @returns 与该用途对应的客户端策略镜像。
 */
export function getClientUploadPolicy(policyKey: UploadPolicyKey): ClientUploadPolicy {
  return CLIENT_UPLOAD_POLICIES[policyKey];
}

/**
 * 解析浏览器文件的规范扩展名。
 *
 * @param filename 浏览器提供的原始文件名。
 * @returns 不带点的小写扩展名；缺失时返回空字符串。
 */
export function getBrowserFileExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  if (index < 0) return '';
  return filename.slice(index + 1).toLowerCase();
}

/**
 * 生成上传初始化使用的 MIME 声明。
 *
 * @param file 浏览器选择的本地文件。
 * @returns 浏览器可信声明或按受支持扩展名补齐的 MIME。
 */
export function resolveDeclaredContentType(file: File): string {
  const extension = getBrowserFileExtension(file.name);
  return file.type || CONTENT_TYPE_BY_EXTENSION[extension] || 'application/octet-stream';
}

/**
 * 在文件加入队列前执行可理解的快速校验。
 *
 * @param file 浏览器选择的本地文件。
 * @param policy 服务端上传策略的客户端镜像。
 * @returns 校验通过返回空值，否则返回面向用户的中文原因。
 */
export function validateClientUploadFile(
  file: File,
  policy: ClientUploadPolicy,
): string | undefined {
  if (file.size <= 0) return `${file.name}：文件不能为空`;
  if (file.size > policy.maxFileSizeBytes) {
    return `${file.name}：文件大小超过 ${formatLimit(policy.maxFileSizeBytes)}`;
  }
  const extension = getBrowserFileExtension(file.name);
  const contentType = resolveDeclaredContentType(file);
  if (
    !policy.allowedExtensions.has(extension) ||
    !policy.allowedContentTypes.has(contentType)
  ) {
    return `${file.name}：当前文档管理不支持该文件类型`;
  }
  return undefined;
}

/**
 * 将策略字节上限转换为简洁显示值。
 *
 * @param bytes 文件字节上限。
 * @returns 以 MiB 或 GiB 表达的限制文案。
 */
function formatLimit(bytes: number): string {
  const gib = bytes / 1024 / 1024 / 1024;
  if (Number.isInteger(gib) && gib >= 1) return `${gib} GiB`;
  return `${Math.round(bytes / 1024 / 1024)} MiB`;
}
