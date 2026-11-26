import { createClient, type RedisClientOptions } from '@keyv/redis';
import { ROOT, logger } from '@/configs/index.js';

/** 环境前缀不允许包含 Redis glob 字符，防止管理扫描或清理越界。 */
function getPrefix(): string {
  let environment = 'dev';
  if (ROOT.APP_PROD) {
    environment = 'prod';
  }
  const prefix = ROOT.redis.prefix ?? `agent-demo:${environment}`;
  if (!/^[\w:.-]+$/.test(prefix)) {
    throw new Error('Redis 前缀只能包含字母、数字、冒号、点、横线和下划线');
  }
  return `${prefix}:cache:`;
}

/** 当前应用和环境共享的缓存前缀。 */
export const cachePrefix = getPrefix();
let socket: RedisClientOptions['socket'] = {
  host: ROOT.redis.host,
  port: ROOT.redis.port,
  connectTimeout: 1500,
  reconnectStrategy: (retries) => Math.min(250 * (retries + 1), 3000),
};
if (ROOT.redis.tls) {
  socket = { ...socket, tls: true };
}

/** 所有 Keyv 空间和管理操作复用一个 Redis 连接，不离线排队。 */
export const redis = createClient({
  socket,
  username: ROOT.redis.username,
  password: ROOT.redis.password,
  database: ROOT.redis.database ?? 0,
  disableOfflineQueue: true,
  commandOptions: { timeout: 2000 },
});
/** 最近一次缓存故障告警时间，避免断线时刷屏。 */
let lastErrorAt = 0;

/** 节流输出缓存故障，禁止记录连接凭据或业务值。 */
export function reportCacheError(): void {
  if (Date.now() - lastErrorAt < 30_000) {
    return;
  }
  lastErrorAt = Date.now();
  logger.warn(
    { event: 'cache.redis_unavailable' },
    'Redis 暂不可用，数据缓存将回源',
  );
}
redis.on('error', reportCacheError);

/** 后台连接 Redis，缓存不可用时不阻塞服务启动。 */
export function startRedis(): void {
  if (!redis.isOpen) {
    void redis.connect().catch(reportCacheError);
  }
}

/**
 * 校验业务键并附加环境、空间前缀，供业务实例与管理接口统一寻址。
 * @param name 已校验的缓存空间名称。
 * @param key 不含前缀的业务键，最长 256 字符且不能包含 U+0000 至 U+001F 控制字符。
 * @returns Redis 中的完整物理键；非法业务键会抛出错误。
 */
export function getCacheKey(name: string, key: string): string {
  if (!key || key.length > 256) {
    throw new Error('CACHE_KEY_INVALID');
  }
  for (const character of key) {
    if (character.charCodeAt(0) < 0x20) {
      throw new Error('CACHE_KEY_INVALID');
    }
  }
  return `${cachePrefix}${name}:${key}`;
}
