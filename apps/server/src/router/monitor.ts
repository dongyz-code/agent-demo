import { ROOT_ERROR } from '@/configs/index.js';

/** 常用资源标识，拒绝空值和超长输入。 */
export const monitorIdSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 255,
} as const;
/** 页区间由共享分页规则进一步限制数量。 */
export const monitorLimitSchema = {
  type: 'array',
  minItems: 2,
  maxItems: 2,
  items: { type: 'integer', minimum: 0, maximum: 1_000_000 },
} as const;
/** Redis 游标是无符号十进制字符串。 */
export const monitorCursorSchema = {
  type: 'string',
  pattern: '^\\d{1,20}$',
} as const;
/** 缓存空间与业务键请求共有字段。 */
export const cacheRequestProperties = {
  name: monitorIdSchema,
  key: { type: 'string', minLength: 1, maxLength: 256 },
  cursor: monitorCursorSchema,
} as const;

/**
 * 将可预期的缓存访问错误映射为统一业务响应，底层连接错误不泄露凭据。
 * @typeParam T 操作返回类型。
 * @param operation 业务操作。
 * @returns 原始结果。
 */
export async function cacheOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.message === 'CACHE_SPACE_NOT_FOUND') {
      throw new ROOT_ERROR('受管缓存不存在');
    }
    if (error instanceof Error && error.message === 'CACHE_KEY_INVALID') {
      throw new ROOT_ERROR('非法参数');
    }
    if (error instanceof ROOT_ERROR) {
      throw error;
    }
    throw new ROOT_ERROR(
      'Redis 不可用',
      'Redis 操作失败，请检查连接、权限或稍后重试',
    );
  }
}
