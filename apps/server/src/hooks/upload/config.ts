import { ROOT_ERROR } from '@/configs/error.js';

import type { ContentType } from '@repo/shared';
import type { FilePurpose } from '@repo/types';

/** 上传会话和预签名的服务端默认限制，客户端不可覆盖。 */
export const uploadConfig = {
  /** 签名最长有效时间，同时用于限制临时写入能力。 */
  presignExpiresSeconds: 20 * 60,
  /** 达到此大小改用 Multipart 传输。 */
  multipartThresholdBytes: 50 * 1024 * 1024,
  /** Multipart 首选分片大小，仍需满足存储端限制。 */
  partSizeBytes: 16 * 1024 * 1024,
  /** 会话允许恢复的最长时间。 */
  sessionExpiresSeconds: 24 * 60 * 60,
} as const;

/** 用途对应的可信验证策略，只从服务端注册表读取。 */
export interface UploadPolicy {
  /** 文件完整字节数的硬上限。 */
  maxFileSizeBytes: number;
  /** 接受的格式族，具体扩展名和 MIME 派生自共享注册表。 */
  allowedTypes: readonly ContentType[];
}

/** 文档和普通附件允许的已注册格式族。 */
const attachmentTypes: readonly ContentType[] = [
  'image',
  'video',
  'audio',
  'text',
  'pdf',
  'word',
  'ppt',
  'excel',
];

/** 不同用途的上传约束，preview 只能由服务端写入。 */
const policies: Record<FilePurpose, UploadPolicy> = {
  attachment: {
    maxFileSizeBytes: 200 * 1024 * 1024,
    allowedTypes: attachmentTypes,
  },
  document: {
    maxFileSizeBytes: 200 * 1024 * 1024,
    allowedTypes: attachmentTypes,
  },
  avatar: { maxFileSizeBytes: 10 * 1024 * 1024, allowedTypes: ['image'] },
  preview: { maxFileSizeBytes: 200 * 1024 * 1024, allowedTypes: ['image'] },
};

/**
 * 获取用途的受控策略，拒绝运行时传入的未知用途。
 *
 * @param purpose 初始化时选择或服务端指定的用途。
 * @returns 当前用途固定的类型与大小限制。
 */
export function getUploadPolicy(purpose: FilePurpose): UploadPolicy {
  if (!Object.hasOwn(policies, purpose)) throw new ROOT_ERROR('非法参数');
  return policies[purpose];
}
