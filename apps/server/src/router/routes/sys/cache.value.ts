import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { cacheOperation, cacheRequestProperties } from '@/router/monitor.js';
import {
  redis,
  cacheKey,
  requireCacheSpace,
  decodeCacheValue,
} from '@/hooks/cache/index.js';
import { ROOT_ERROR } from '@/configs/index.js';

/**
 * 递归遮盖常见凭据字段；只有已允许查看的空间才会调用。
 * @param value JSON 值。
 * @returns 脱敏副本。
 */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (/password|secret|token|api.?key|authorization|cookie/i.test(key)) {
          return [key, '******'];
        }
        return [key, redact(entry)];
      }),
    );
  }
  return value;
}

const { api } = routerHandler({
  url: '/sys/cache/value',
  method: 'POST',
  permission: adminPermissionKey('actions.cache.view'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'key'],
      properties: {
        name: cacheRequestProperties.name,
        key: cacheRequestProperties.key,
      },
    },
  },
  handler: async ({ body }) => {
    return await cacheOperation(async () => {
      const space = requireCacheSpace(body.name);
      if (!space.inspectable) {
        throw new ROOT_ERROR('认证: 权限不足', '该业务空间不开放值查看');
      }
      const key = cacheKey(body.name, body.key);
      if ((await redis.type(key)) !== 'string') {
        throw new ROOT_ERROR('非法参数', '仅支持查看 JSON 字符串缓存');
      }
      // 用 Lua 原子检查字节数后读取，避免检查与读取之间被替换为大对象。
      const value = await redis.eval(
        "if redis.call('STRLEN', KEYS[1]) > 16384 then return false end return redis.call('GET', KEYS[1])",
        { keys: [key], arguments: [] },
      );
      if (value === null) {
        throw new ROOT_ERROR('非法参数', '键已过期或内容超过 16 KB');
      }
      const decoded = await decodeCacheValue(body.name, String(value));
      if (decoded === undefined) {
        throw new ROOT_ERROR('非法参数', '键已过期');
      }
      return {
        value: redact(decoded),
        ttl: await redis.ttl(key),
      };
    });
  },
});
export default api;
