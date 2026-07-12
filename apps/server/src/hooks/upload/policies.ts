import { getUploadRuntimeConfig } from '@/configs/index.js';

import { createUploadError } from './errors.js';

import type { UploadPolicy } from './types.js';
import type { UploadPolicyKey } from '@repo/types';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const RAG_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
] as const;

/**
 * 返回当前服务端注册的上传策略。
 *
 * 策略只表达文件传输与存储限制，不包含知识库权限或解析流程。
 */
export function listUploadPolicies(): Record<UploadPolicyKey, UploadPolicy> {
  const config = getUploadRuntimeConfig();
  return {
    'default-attachment': {
      key: 'default-attachment',
      allowedContentTypes: [...IMAGE_TYPES, ...RAG_DOCUMENT_TYPES],
      allowedExtensions: [
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
      ],
      maxFileSizeBytes: config.maxFileSizeBytes,
      multipartThresholdBytes: config.multipartThresholdBytes,
      partSizeBytes: config.partSizeBytes,
      previewEnabled: true,
      unboundRetentionDays: config.unboundRetentionDays,
    },
    image: {
      key: 'image',
      allowedContentTypes: IMAGE_TYPES,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'webp'],
      maxFileSizeBytes: Math.min(config.maxFileSizeBytes, 50 * 1024 * 1024),
      multipartThresholdBytes: config.multipartThresholdBytes,
      partSizeBytes: config.partSizeBytes,
      previewEnabled: true,
      unboundRetentionDays: config.unboundRetentionDays,
    },
    'rag-document': {
      key: 'rag-document',
      allowedContentTypes: RAG_DOCUMENT_TYPES,
      allowedExtensions: ['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'csv'],
      maxFileSizeBytes: config.maxFileSizeBytes,
      multipartThresholdBytes: config.multipartThresholdBytes,
      partSizeBytes: config.partSizeBytes,
      previewEnabled: true,
      unboundRetentionDays: config.unboundRetentionDays,
    },
  };
}

/**
 * 按策略键读取策略。
 *
 * @param key 客户端选择且已通过路由权限检查的策略键。
 * @returns 服务端可信上传策略。
 */
export function getUploadPolicy(key: UploadPolicyKey): UploadPolicy {
  const policy = listUploadPolicies()[key];
  if (!policy) {
    throw createUploadError('UPLOAD_INVALID_POLICY', '上传策略不存在');
  }
  return policy;
}
