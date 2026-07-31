import { ROOT_ERROR } from '@/configs/index.js';
import { documentsConfig } from '../config.js';
import { collectContentTypes } from '@repo/shared';

import type { UploadPolicyKey } from '@repo/types';
import type { SupportedFileExtension } from '@repo/shared';

/** 服务端注册的上传策略。 */
interface UploadPolicy {
  /** 允许的可信 MIME 集合。 */
  allowedContentTypes: readonly string[];
  /** 允许的扩展名集合，不包含点。 */
  allowedExtensions: readonly SupportedFileExtension[];
  /** 策略允许的最大文件字节数。 */
  maxFileSizeBytes: number;
  /** 达到该字节数后使用 Multipart。 */
  multipartThresholdBytes: number;
  /** 默认 Multipart 分片字节数。 */
  partSizeBytes: number;
}

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
const IMAGE_TYPES = collectContentTypes(IMAGE_EXTENSIONS);
const RAG_DOCUMENT_TYPES = collectContentTypes(RAG_DOCUMENT_EXTENSIONS);

/** 服务端上传配置，仅在模块加载时读取一次。 */
const config = documentsConfig.upload;

/** 服务端注册的文件传输与存储限制。 */
const uploadPolicies: Record<UploadPolicyKey, UploadPolicy> = {
  'default-attachment': {
    allowedContentTypes: [...IMAGE_TYPES, ...RAG_DOCUMENT_TYPES],
    allowedExtensions: [...IMAGE_EXTENSIONS, ...RAG_DOCUMENT_EXTENSIONS],
    maxFileSizeBytes: config.maxFileSizeBytes,
    multipartThresholdBytes: config.multipartThresholdBytes,
    partSizeBytes: config.partSizeBytes,
  },
  image: {
    allowedContentTypes: IMAGE_TYPES,
    allowedExtensions: IMAGE_EXTENSIONS,
    maxFileSizeBytes: Math.min(config.maxFileSizeBytes, 50 * 1024 * 1024),
    multipartThresholdBytes: config.multipartThresholdBytes,
    partSizeBytes: config.partSizeBytes,
  },
  'rag-document': {
    allowedContentTypes: RAG_DOCUMENT_TYPES,
    allowedExtensions: RAG_DOCUMENT_EXTENSIONS,
    maxFileSizeBytes: config.maxFileSizeBytes,
    multipartThresholdBytes: config.multipartThresholdBytes,
    partSizeBytes: config.partSizeBytes,
  },
};

/**
 * 按策略键读取策略。
 *
 * @param key 客户端选择且已通过路由权限检查的策略键。
 * @returns 服务端可信上传策略。
 */
export function getUploadPolicy(key: UploadPolicyKey): UploadPolicy {
  const policy = uploadPolicies[key];
  if (!policy) {
    throw new ROOT_ERROR('非法参数');
  }
  return policy;
}
