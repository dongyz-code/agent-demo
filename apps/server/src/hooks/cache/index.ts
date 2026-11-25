import { createClient } from 'redis';
import { ROOT, logger } from '@/configs/index.js';
import type { CacheInfo, RedisOverview } from '@repo/types';

/** 只允许应用自行声明空间，不接受管理请求注册任意键前缀。 */
export const cacheSpaces: CacheInfo[] = [
  {
    name: 'system.settings',
    label: '系统配置',
    description:
      '系统配置读取缓存；修改后失效，最长 30 秒回源。可能含内部配置，不开放值查看。',
    ttl: 30,
    inspectable: false,
  },
];

/** 环境前缀必须唯一且不含 Redis glob 字符，防止扫描或清理越界。 */
function getPrefix(): string {
  const prefix =
    ROOT.redis.prefix ?? `agent-demo:${ROOT.APP_PROD ? 'prod' : 'dev'}`;
  if (!/^[\w:.-]+$/.test(prefix))
    throw new Error('Redis 前缀只能包含字母、数字、冒号、点、横线和下划线');
  return `${prefix}:cache:`;
}

/** 当前应用专属数据前缀。 */
export const cachePrefix = getPrefix();
/** 官方客户端不离线排队，故障时业务及时回源。 */
export const redis = createClient({
  socket: {
    host: ROOT.redis.host,
    port: ROOT.redis.port,
    connectTimeout: 1500,
    reconnectStrategy: (retries) => Math.min(250 * (retries + 1), 3000),
    ...(ROOT.redis.tls ? { tls: true as const } : {}),
  },
  username: ROOT.redis.username,
  password: ROOT.redis.password,
  database: ROOT.redis.database ?? 0,
  disableOfflineQueue: true,
  commandOptions: { timeout: 2000, rejectInFlight: true },
});
/** 节流故障日志，防止 Redis 长期离线持续刷屏。 */
let lastErrorAt = 0;
redis.on('error', () => {
  if (Date.now() - lastErrorAt < 30_000) return;
  lastErrorAt = Date.now();
  logger.warn(
    { event: 'cache.redis_unavailable' },
    'Redis 暂不可用，数据缓存将回源',
  );
});

/** 后台连接，不让可降级的数据缓存阻塞主服务启动。 */
export function startRedis(): void {
  if (!redis.isOpen) void redis.connect().catch(() => {});
}

/**
 * 仅允许访问声明过的业务空间。
 * @param name 空间标识。
 * @returns 空间声明。
 */
export function requireCacheSpace(name: string): CacheInfo {
  const space = cacheSpaces.find((item) => item.name === name);
  if (!space) throw new Error('CACHE_SPACE_NOT_FOUND');
  return space;
}

/**
 * 校验业务键并组成实际 Redis 键。
 * @param name 已注册空间。
 * @param key 不带环境前缀的业务键。
 * @returns 完整键。
 */
export function cacheKey(name: string, key: string): string {
  requireCacheSpace(name);
  if (!key || key.length > 256 || /[\x00-\x1f]/.test(key))
    throw new Error('CACHE_KEY_INVALID');
  return `${cachePrefix}${name}:${key}`;
}

/** 同一进程内合并并发回源；不宣称提供分布式业务锁。 */
const pendingLoads = new Map<string, Promise<unknown>>();

/**
 * 读取 JSON 缓存，离线或格式损坏时回源；业务工厂错误原样抛出。
 * @typeParam T 可序列化的业务数据类型。
 * @param name 已注册的业务空间。
 * @param key 公开业务键，不能携带凭据。
 * @param load 未命中时查询真实数据的函数。
 * @returns 缓存值或真实数据。
 */
export async function loadCached<T>(
  name: string,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const fullKey = cacheKey(name, key);
  if (redis.isReady) {
    try {
      const value = await redis.get(fullKey);
      if (value !== null) return JSON.parse(value) as T;
    } catch {
      /* 缓存故障不改变业务读取结果。 */
    }
  }
  const pending = pendingLoads.get(fullKey);
  if (pending) return pending as Promise<T>;
  const operation = (async () => {
    let generation: string | null = null;
    if (redis.isReady) {
      try {
        generation = await redis.get(`${cachePrefix}generation:${name}`);
      } catch {
        /* 离线时只回源。 */
      }
    }
    const value = await load();
    if (redis.isReady) {
      try {
        // 比较失效版本再写入，避免清理期间尚未完成的回源重新填入旧值。
        await redis.eval(
          "if redis.call('GET', KEYS[1]) == ARGV[1] or (not redis.call('GET', KEYS[1]) and ARGV[1] == '') then return redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3]) end return 0",
          {
            keys: [`${cachePrefix}generation:${name}`, fullKey],
            arguments: [
              generation ?? '',
              JSON.stringify(value),
              String(requireCacheSpace(name).ttl),
            ],
          },
        );
      } catch {
        /* 写缓存失败不覆盖真实数据。 */
      }
    }
    return value;
  })();
  pendingLoads.set(fullKey, operation);
  try {
    return await operation;
  } finally {
    pendingLoads.delete(fullKey);
  }
}

/**
 * 失效一个业务键，同时禁止已有回源写回旧值。
 * @param name 已注册空间。
 * @param key 业务键。
 */
export async function invalidateCache(
  name: string,
  key: string,
): Promise<void> {
  if (!redis.isReady) return;
  try {
    await redis
      .multi()
      .incr(`${cachePrefix}generation:${name}`)
      .unlink(cacheKey(name, key))
      .exec();
  } catch {
    logger.warn(
      { event: 'cache.invalidate_failed', space: name },
      '缓存失效失败，将在 TTL 到期后回源',
    );
  }
}

/**
 * 把 Redis INFO 协议解析为平面字段。
 * @param info Redis 原始信息。
 * @returns 字段字典。
 */
export function parseRedisInfo(info: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of info.split('\r\n')) {
    const index = line.indexOf(':');
    if (index > 0 && !line.startsWith('#'))
      fields[line.slice(0, index)] = line.slice(index + 1);
  }
  return fields;
}

/**
 * 获取安全白名单指标，指标统计范围为整个 Redis 实例。
 * @returns 健康与资源快照。
 */
export async function redisOverview(): Promise<RedisOverview> {
  const result: RedisOverview = {
    connected: false,
    error: null,
    prefix: cachePrefix,
    collectedAt: new Date().toISOString(),
    metrics: {},
  };
  if (!redis.isReady)
    return { ...result, error: 'Redis 尚未连接，业务缓存当前回源读取' };
  try {
    const info = parseRedisInfo(await redis.info());
    const keys = [
      'redis_version',
      'uptime_in_seconds',
      'used_memory',
      'used_memory_human',
      'maxmemory',
      'maxmemory_human',
      'connected_clients',
      'keyspace_hits',
      'keyspace_misses',
      'evicted_keys',
      'expired_keys',
      'instantaneous_ops_per_sec',
    ];
    for (const key of keys) result.metrics[key] = info[key] ?? '0';
    result.connected = true;
  } catch {
    result.error = 'Redis 指标读取失败，请检查连接及 INFO 权限';
  }
  return result;
}

/**
 * 带预算地扫描一个空间；不使用 KEYS，不返回虚假的总数。
 * @param name 受管空间。
 * @param cursor 上页返回的 Redis 游标。
 * @param search 业务键字面关键字，不解释 glob。
 * @returns 本批条目、扫描数量和下页游标。
 */
export async function scanCache(name: string, cursor = '0', search = '') {
  requireCacheSpace(name);
  if (!redis.isReady) throw new Error('CACHE_UNAVAILABLE');
  const prefix = `${cachePrefix}${name}:`;
  const list: { key: string; type: string; ttl: number }[] = [];
  let scanned = 0;
  let next = cursor;
  for (let round = 0; round < 10; round += 1) {
    const batch = await redis.scan(next, { MATCH: `${prefix}*`, COUNT: 100 });
    next = batch.cursor;
    scanned += batch.keys.length;
    for (const key of batch.keys) {
      const shortKey = key.slice(prefix.length);
      if (!shortKey.includes(search)) continue;
      const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)]);
      if (ttl !== -2) list.push({ key: shortKey, type, ttl });
    }
    if (next === '0' || list.length >= 100) break;
  }
  return { list, cursor: next, scanned };
}

/**
 * 清理一键或一批空间键，调用方按游标继续，避免阻塞请求。
 * @param name 受管空间。
 * @param key 可选业务键。
 * @param cursor 批量清理游标。
 * @returns 本批删除数量与下个游标。
 */
export async function clearCache(name: string, key?: string, cursor = '0') {
  requireCacheSpace(name);
  if (!redis.isReady) throw new Error('CACHE_UNAVAILABLE');
  await redis.incr(`${cachePrefix}generation:${name}`);
  if (key !== undefined)
    return { removed: await redis.unlink(cacheKey(name, key)), cursor: '0' };
  const batch = await redis.scan(cursor, {
    MATCH: `${cachePrefix}${name}:*`,
    COUNT: 200,
  });
  let removed = 0;
  if (batch.keys.length) removed = await redis.unlink(batch.keys);
  return { removed, cursor: batch.cursor };
}
