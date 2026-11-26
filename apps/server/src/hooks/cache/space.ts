import { createCache, type Cache } from 'cache-manager';
import { createKeyv } from '@keyv/redis';
import { cachePrefix, getCacheKey, redis, reportCacheError } from './redis.js';

/**
 * 一个业务缓存空间，内部委托 Keyv 存储、cache-manager 回源与合并并发请求。
 * @typeParam T 当前空间中可 JSON 序列化的业务值类型。
 */
export class CacheSpace<T> {
  private readonly store: ReturnType<typeof createKeyv>;
  private readonly manager: Cache;

  /**
   * 初始化缓存空间，不主动创建连接或修改 Redis 数据。
   * @param name 唯一空间标识，只允许小写字母、数字、点和横线。
   * @param ttl 默认有效期，单位毫秒，必须为正整数。
   */
  constructor(
    private readonly name: string,
    ttl: number,
  ) {
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(name)) {
      throw new Error('CACHE_SPACE_INVALID');
    }

    if (!Number.isSafeInteger(ttl) || ttl <= 0) {
      throw new Error('CACHE_TTL_INVALID');
    }

    this.store = createKeyv(redis, {
      namespace: `${cachePrefix}${name}`,
      keyPrefixSeparator: ':',
      // 缓存故障只记录告警，避免 wrap 在回源成功后因写缓存失败而报错。
      throwOnErrors: false,
      throwOnConnectError: false,
    });
    this.store.on('error', reportCacheError);
    this.manager = createCache({ stores: [this.store], ttl });
    this.manager.on('get', ({ error }) => {
      if (error) {
        reportCacheError();
      }
    });
  }

  /**
   * 读取业务值；不存在、损坏或 Redis 不可用时返回 undefined。
   * @param key 当前空间内的业务键，不包含环境前缀。
   */
  async get(key: string): Promise<T | undefined> {
    getCacheKey(this.name, key);
    if (!redis.isReady) {
      return undefined;
    }
    return await this.manager.get<T>(key);
  }

  /**
   * 按默认 TTL 写入业务值；Redis 故障时跳过写入。
   * @param value 可 JSON 序列化的值，不能为 undefined。
   */
  async set(key: string, value: T): Promise<void> {
    getCacheKey(this.name, key);
    if (value === undefined) {
      throw new Error('CACHE_VALUE_INVALID');
    }
    if (!redis.isReady) {
      return;
    }
    await this.manager.set(key, value);
  }

  /**
   * 删除业务键；Redis 故障时依赖 TTL 到期，正在执行的回源仍可能写入。
   */
  async del(key: string): Promise<void> {
    getCacheKey(this.name, key);
    if (!redis.isReady) {
      return;
    }
    await this.manager.del(key);
  }

  /** 分批清理当前空间，失败时抛出错误；持续回源或写入可能产生新键。 */
  async clear(): Promise<void> {
    let cursor = '0';
    do {
      const batch = await this.clearBatch(cursor);
      cursor = batch.cursor;
    } while (cursor !== '0');
  }

  /**
   * 使用库提供的回源与并发合并；Redis 离线时直接读取真实数据。
   * @param key 当前空间内的业务键。
   * @param load 未命中时读取真实数据，业务异常原样抛出。
   * @returns 缓存值或回源值；清理缓存不会取消已开始的回源。
   */
  async wrap(key: string, load: () => Promise<T>): Promise<T> {
    getCacheKey(this.name, key);
    if (!redis.isReady) {
      return await load();
    }
    return await this.manager.wrap(key, load);
  }

  /**
   * 供管理接口解码已限制体积的原始值，隐藏 Keyv 内部结构。
   * @param raw 从当前空间读取的序列化内容。
   * @returns 业务值；条目无效或过期时返回 undefined。
   */
  async decode(raw: string): Promise<unknown> {
    const data = await this.store.deserializeData<unknown>(raw);
    if (data?.expires !== undefined && data.expires <= Date.now()) {
      return undefined;
    }
    return data?.value;
  }

  /**
   * 清理一批空间键，供整空间清理和管理端分页清理复用。
   * @param cursor 上一批返回的 Redis 游标，首批传 0。
   * @returns 实际删除数量与后续游标；连接或命令失败时抛出错误。
   */
  async clearBatch(cursor = '0') {
    if (!redis.isReady) {
      throw new Error('CACHE_UNAVAILABLE');
    }
    const batch = await redis.scan(cursor, {
      MATCH: `${cachePrefix}${this.name}:*`,
      COUNT: 200,
    });
    let removed = 0;
    if (batch.keys.length) {
      removed = await redis.unlink(batch.keys);
    }
    return { removed, cursor: batch.cursor };
  }
}
