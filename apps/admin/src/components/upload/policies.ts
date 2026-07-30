import {
  collectContentTypes,
  contentTypesByExtension,
  getFileExtension,
} from '@repo/shared';

import type { UploadPolicyKey } from '@/types';
import type { SupportedFileExtension } from '@repo/shared';

/** 管理端用于即时反馈的上传策略镜像；服务端仍是最终安全边界。 */
export interface ClientUploadPolicy {
  /** 文件 input 使用的扩展名白名单。 */
  accept: string;
  /** 允许的浏览器 MIME 集合。 */
  allowedContentTypes: ReadonlySet<string>;
  /** 允许的不带点小写扩展名集合。 */
  allowedExtensions: ReadonlySet<SupportedFileExtension>;
  /** 单文件最大字节数。 */
  maxFileSizeBytes: number;
}

/** 文档管理单文件上限，与服务端当前配置的 2 GiB 保持一致。 */
const DOCUMENT_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
const RAG_DOCUMENT_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'txt',
  'md',
  'csv',
] as const;

/** 当前管理端可选择的上传策略镜像。 */
const CLIENT_UPLOAD_POLICIES: Record<UploadPolicyKey, ClientUploadPolicy> = {
  'default-attachment': createPolicy([
    ...IMAGE_EXTENSIONS,
    ...RAG_DOCUMENT_EXTENSIONS,
  ]),
  image: createPolicy(IMAGE_EXTENSIONS, 50 * 1024 * 1024),
  'rag-document': createPolicy(RAG_DOCUMENT_EXTENSIONS),
};

/**
 * 创建单个客户端策略镜像。
 *
 * @param extensions 允许的不带点扩展名。
 * @param maxFileSizeBytes 单文件最大字节数，默认使用文档上限。
 * @returns 可供 input、Uppy 和手工校验共同使用的策略。
 */
function createPolicy(
  extensions: readonly SupportedFileExtension[],
  maxFileSizeBytes = DOCUMENT_MAX_FILE_SIZE_BYTES,
): ClientUploadPolicy {
  return {
    accept: extensions.map((extension) => `.${extension}`).join(','),
    allowedContentTypes: new Set(collectContentTypes(extensions)),
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
 * 生成上传初始化使用的 MIME 声明。
 *
 * 浏览器声明在当前扩展名的兼容列表内时保留，否则回落到规范 MIME。
 *
 * @param file 浏览器选择的本地文件。
 * @returns 兼容的浏览器声明、规范 MIME 或通用二进制 MIME。
 */
export function resolveDeclaredContentType(file: File): string {
  const extension = getFileExtension(file.name);
  const compatibleContentTypes: readonly string[] | undefined = extension
    ? contentTypesByExtension[extension]
    : undefined;
  if (file.type && compatibleContentTypes?.includes(file.type)) {
    return file.type;
  }
  const canonicalContentType = compatibleContentTypes?.[0];
  if (canonicalContentType) return canonicalContentType;
  return file.type || 'application/octet-stream';
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
  const extension = getFileExtension(file.name);
  const contentType = resolveDeclaredContentType(file);
  if (
    !extension ||
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
