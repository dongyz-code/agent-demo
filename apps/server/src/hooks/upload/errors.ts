import { ROOT_ERROR } from '@/configs/index.js';

import type { UploadErrorCode } from '@repo/types';

/**
 * 创建通用上传业务错误。
 *
 * @param code 稳定错误码，供日志和管理端定位阶段。
 * @param message 面向用户的中文说明，不得包含签名 URL 和存储凭证。
 * @param kind HTTP 语义对应的根错误类型。
 * @returns 可直接抛出的项目根错误。
 */
export function createUploadError(
  code: UploadErrorCode,
  message: string,
  kind: 'bad-request' | 'forbidden' | 'not-found' | 'conflict' | 'internal' =
    'bad-request',
) {
  const key = {
    'bad-request': '非法参数',
    forbidden: '认证: 权限不足',
    'not-found': '相关文件不存在',
    conflict: '数据异常',
    internal: '服务异常',
  } as const;
  return new ROOT_ERROR(key[kind], `${code}: ${message}`);
}
