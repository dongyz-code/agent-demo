import { cachePrefix, getCacheKey, redis } from './redis.js';
import { CacheSpace } from './space.js';
import type { CacheInfo, RedisStatus } from '@repo/types';
import type { CacheOptions } from './types.js';

export { startRedis, redis } from './redis.js';
export type { CacheOptions } from './types.js';

/** 已声明的业务空间及其管理入口，管理端不能动态注册。 */
interface RegisteredCache {
  /** 管理端使用的空间信息，TTL 单位沿用接口约定的秒。 */
  info: CacheInfo;
  /** 类实例隐藏存储细节，管理接口复用其解码与分批清理能力。 */
  cache: CacheSpace<unknown>;
}
/** 定义缓存时自动登记，业务不再维护第二份空间清单。 */
const registry = new Map<string, RegisteredCache>();

/** 返回当前进程已加载的业务缓存清单。 */
export function listCacheSpaces(): CacheInfo[] {
  return [...registry.values()].map((entry) => ({ ...entry.info }));
}

/**
 * 仅允许访问代码中已经定义的缓存空间。
 * @param name 稳定业务空间标识。
 * @returns 管理端展示及访问控制信息。
 */
export function requireCacheSpace(name: string): CacheInfo {
  const entry = registry.get(name);
  if (!entry) {
    throw new Error('CACHE_SPACE_NOT_FOUND');
  }
  return entry.info;
}

/**
 * 校验业务键并构造 Redis 物理键；业务实例无需手动拼接前缀。
 * @param name 已声明的业务空间。
 * @param key 不包含环境前缀的业务键。
 * @returns 用于管理扫描和删除的完整 Redis 键。
 */
export function cacheKey(name: string, key: string): string {
  requireCacheSpace(name);
  return getCacheKey(name, key);
}

/**
 * 将受限体积的存储内容解码为业务值，不把 Keyv 内部过期信息展示到页面。
 * @param name 已声明并允许查看的缓存空间。
 * @param raw 管理接口原子读取的序列化数据。
 * @returns 实际业务值；条目无效或过期时返回 undefined。
 */
export async function decodeCacheValue(
  name: string,
  raw: string,
): Promise<unknown> {
  requireCacheSpace(name);
  return await registry.get(name)!.cache.decode(raw);
}

/**
 * 声明类型化 JSON 缓存并自动登记管理信息；空间只能定义一次。
 * @typeParam T 当前业务空间内所有键共用的可 JSON 序列化数据类型。
 * @param options 空间标识、展示信息和以毫秒计的默认 TTL。
 * @returns 隐藏连接与前缀细节的 get、set、del、clear、wrap 操作。
 */
export function defineCache<T>(options: CacheOptions): CacheSpace<T> {
  if (registry.has(options.name)) {
    throw new Error('CACHE_SPACE_ALREADY_DEFINED');
  }
  // 固定声明快照，调用方修改原对象不能让实际 TTL 与管理信息漂移。
  const { name, ttl } = options;
  const cache = new CacheSpace<T>(name, ttl);
  registry.set(name, {
    info: {
      name,
      label: options.label,
      description: options.description ?? '',
      ttl: Math.ceil(ttl / 1000),
      inspectable: options.inspectable ?? false,
    },
    cache,
  });
  return cache;
}

/**
 * 通过有超时限制的 PING 检查连接，不再读取实例 INFO 或要求其权限。
 * @returns 连接是否可用及不包含凭据的故障提示；离线时业务缓存会回源。
 */
export async function redisStatus(): Promise<RedisStatus> {
  const result: RedisStatus = {
    connected: false,
    error: null,
  };
  if (!redis.isReady) {
    return { ...result, error: 'Redis 尚未连接，业务缓存当前回源读取' };
  }
  try {
    await redis.ping();
    result.connected = true;
  } catch {
    result.error =
      'Redis 连接检查失败，业务缓存当前回源读取，请恢复连接后重新扫描';
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
  if (!redis.isReady) {
    throw new Error('CACHE_UNAVAILABLE');
  }
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
      if (!shortKey.includes(search)) {
        continue;
      }
      const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)]);
      if (ttl !== -2) {
        list.push({ key: shortKey, type, ttl });
      }
    }
    if (next === '0' || list.length >= 100) {
      break;
    }
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
  if (!redis.isReady) {
    throw new Error('CACHE_UNAVAILABLE');
  }
  if (key !== undefined) {
    return { removed: await redis.unlink(cacheKey(name, key)), cursor: '0' };
  }
  return await registry.get(name)!.cache.clearBatch(cursor);
}
