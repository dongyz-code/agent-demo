import { ROOT_ERROR } from '@/configs/error.js';

import type { ContentType } from '@repo/shared';
import type { FilePurpose } from '@repo/types';

const mb = 1024 * 1024;

const generalTypes = [
  'image',
  'video',
  'audio',
  'text',
  'pdf',
  'word',
  'ppt',
  'excel',
] as const satisfies readonly ContentType[];

type UploadPolicy = {
  maxFileSizeBytes: number;
  allowedTypes: readonly ContentType[];
};

/** 上传限制。字段长度和存储端分片上下限用默认值。 */
export const uploadConfig = {
  presignExpiresSeconds: 20 * 60,
  multipartThresholdBytes: 50 * mb,
  partSizeBytes: 16 * mb,
  sessionExpiresSeconds: 24 * 60 * 60,
  /** preview 只能由服务端写入 */
  clientPurposes: ['attachment', 'document', 'avatar'] as const,
  policies: {
    attachment: { maxFileSizeBytes: 200 * mb, allowedTypes: generalTypes },
    document: { maxFileSizeBytes: 200 * mb, allowedTypes: generalTypes },
    avatar: { maxFileSizeBytes: 10 * mb, allowedTypes: ['image'] },
    preview: { maxFileSizeBytes: 200 * mb, allowedTypes: ['image'] },
  } satisfies Record<FilePurpose, UploadPolicy>,
};

/** 读取用途限制，未注册用途直接拒绝 */
export function getUploadPolicy(purpose: FilePurpose): UploadPolicy {
  if (!Object.hasOwn(uploadConfig.policies, purpose)) {
    throw new ROOT_ERROR('非法参数');
  }
  return uploadConfig.policies[purpose];
}
