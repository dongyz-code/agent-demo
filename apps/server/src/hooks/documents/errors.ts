import { ROOT_ERROR } from '@/configs/index.js';

import type { DomainErrorKind, DocumentsErrorCode } from '@repo/types';

/** 错误分类到 ROOT_ERROR 注册的中文键与 HTTP 状态码的映射。 */
const KIND_TO_KEY = {
  'bad-request': '非法参数',
  forbidden: '认证: 权限不足',
  'not-found': '相关文件不存在',
  conflict: '数据异常',
  internal: '服务异常',
  unavailable: '服务异常',
} as const satisfies Record<DomainErrorKind, string>;

/**
 * 创建 documents 域统一业务错误。
 *
 * @param code 稳定错误码，供日志和管理端定位阶段。
 * @param message 面向用户的中文说明，不得包含签名 URL 和存储凭证。
 * @param kind HTTP 语义对应的错误分类，默认 bad-request。
 * @returns 接入统一 ROOT_ERROR 的可抛出错误，携带正确 HTTP 状态码。
 */
export function createDomainError(
  code: DocumentsErrorCode | string,
  message: string,
  kind: DomainErrorKind = 'bad-request',
) {
  return new ROOT_ERROR(KIND_TO_KEY[kind], `${code}: ${message}`);
}
