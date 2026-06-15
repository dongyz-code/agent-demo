import { Redis } from 'ioredis';

import type { RedisOptions } from 'ioredis';

export type RedisClientOpts<Group extends string> = {
  /** redis 配置 */
  redisOptions: RedisOptions;
  /** 组(限定key，避免乱序) */
  groups: Group[];
  /** 构造 redis key */
  redisKey: (
    group: Group,
    /** 标签（可选），多个值共享一个 group 便于区分 */
    tag?: string,
  ) => string;
  /** 调试模式 */
  debug?: {
    hooks?: {
      /** 主动过期时调用 */
      expire?: (body: { group: Group; tag?: string; id: string }) => void;
      /** 主动设置缓存时调用 */
      set?: (body: { group: Group; tag?: string; id: string }) => void;
    };
  };
};

const TIMESTAMP_KEY = '_t_';

/** 默认过期时间（秒） */
const DEFAULT_EXPIRE = 60 * 10;

export class RedisClient<Group extends string> {
  private opts: RedisClientOpts<Group>;
  private client: Redis;
  /** 每个id 对应的 promise 缓存，如果命中（正在获取中），则等待 */
  private idCacheMap: Map<string, Promise<unknown>>;
  constructor(opts: RedisClientOpts<Group>) {
    this.opts = opts;
    this.client = new Redis(opts.redisOptions);
    this.idCacheMap = new Map();
  }
  /** 缓存 promise, 避免同ID同时执行多次 */
  private idCacheRun<T extends () => Promise<unknown>>(
    id: string,
    callback: T,
  ) {
    type Resp = Awaited<ReturnType<T>>;
    const item = this.idCacheMap.get(id);
    if (item) {
      return item as Promise<Resp>;
    }
    const promise = callback();
    promise.finally(() => this.idCacheMap.delete(id));
    this.idCacheMap.set(id, promise);
    return promise as Promise<Resp>;
  }
  /** 设置缓存立即过期 0s */
  expire(group: Group, tag?: string) {
    const id = this.opts.redisKey(group, tag);
    const resp = this.client.expire(id, 0);
    this.opts.debug?.hooks?.expire?.({ group, tag, id });
    return resp;
  }
  /**
   * 获取函数
   *
   * 数据结构是 hmap, 两个键: _t_(时间戳) 和 d(数据)
   */
  get<Resp>({ group, tag }: { group: Group; tag?: string }) {
    const id = this.opts.redisKey(group, tag);
    const client = this.client;

    return this.idCacheRun(id, async () => {
      const value = await client.hget(id, 'd');
      if (value !== null) {
        return JSON.parse(value) as Resp;
      }
      return null;
    });
  }
  async set<T extends () => Promise<unknown>>({
    group,
    tag,
    callback,
    expire = DEFAULT_EXPIRE,
  }: {
    group: Group;
    tag?: string;
    callback: T;
    /** 过期时间（秒）, 默认 10min, 设置为 0 表示不主动过期，需要手动调用 expire 过期 */
    expire?: number;
  }): Promise<Awaited<ReturnType<T>>> {
    const id = this.opts.redisKey(group, tag);
    const client = this.client;

    /** 设置 Redis 缓存 */
    const now = Date.now();
    const data = await callback();
    /** 兼容下多进程的情况 */
    const t = await client.hget(id, TIMESTAMP_KEY);
    /** 如果有缓存且缓存时间大于当前时间(其它进程设置了缓存)，则返回缓存 */
    if (t && +t > now) {
      return JSON.parse((await client.hget(id, 'd'))!);
    }
    await client.hset(id, {
      [TIMESTAMP_KEY]: now,
      d: JSON.stringify(data),
    });
    this.opts.debug?.hooks?.set?.({ group, tag, id });
    if (expire > 0) {
      await client.expire(id, expire);
    }
    return data as Awaited<ReturnType<T>>;
  }
  /**
   * 获取函数，如果缓存不存在，则调用 callback 获取数据，并设置缓存 (单数据)
   *
   * 数据结构是 hmap, 两个键: _t_(时间戳) 和 d(数据)
   */
  getSet<T extends () => Promise<unknown>>({
    group,
    tag,
    callback,
    expire = DEFAULT_EXPIRE,
  }: {
    group: Group;
    tag?: string;
    callback: T;
    /** 过期时间（秒）, 默认 10min, 设置为 0 表示不主动过期，需要手动调用 expire 过期 */
    expire?: number;
  }) {
    type Resp = Awaited<ReturnType<T>>;

    const id = this.opts.redisKey(group, tag);
    const client = this.client;

    return this.idCacheRun(id, async () => {
      const value = await client.hget(id, 'd');
      if (value !== null) {
        return JSON.parse(value) as Resp;
      }
      return await this.set({ group, tag, callback, expire });
    });
  }
  /**
   * 获取函数，如果缓存不存在，则调用 callback 获取数据，并设置缓存 (多数据)
   *
   * 数据结构是 hmap, 多个键: _t_(时间戳) 和 多个数据 key
   *
   * 如果拿到的是 undefined，表示改 key 不存在（非法）
   */
  hget<
    T extends () => Promise<Record<string, unknown>>,
    K extends keyof Awaited<ReturnType<T>>,
    Ks extends K | K[],
  >({
    group,
    tag,
    key,
    callback,
    expire = DEFAULT_EXPIRE,
  }: {
    /** 组 */
    group: Group;
    /** 标签（可选） */
    tag?: string;
    /** 键(string)，支持数组 */
    key: Ks;
    /** 数据获取 */
    callback: T;
    /** 过期时间（秒）, 默认 10min, 设置为 0 表示不设置过期时间 */
    expire?: number;
  }) {
    type Resp = Awaited<ReturnType<T>>;
    type RespKey = Resp[K];
    type RespFinal = Ks extends K[]
      ? (RespKey | undefined)[]
      : RespKey | undefined;

    const keys = (Array.isArray(key) ? key : [key]) as string[];
    if (keys.includes(TIMESTAMP_KEY)) {
      throw new Error(`${TIMESTAMP_KEY} can not be used as key`);
    }

    const id = this.opts.redisKey(group, tag);
    const client = this.client;

    const idCacheKey = `${id}:${keys.slice().sort().join()}`;

    const handleVals = (vals: (string | null)[]) => {
      const temp = vals.map((val) =>
        val ? (JSON.parse(val) as RespKey) : undefined,
      );
      return (typeof key === 'string' ? temp[0] : temp) as RespFinal;
    };

    const set = async () => {
      return await this.idCacheRun(id, async () => {
        const now = Date.now();
        let data = (await callback()) as Resp;

        /** 兼容下多进程的情况 */
        const t = await client.hget(id, TIMESTAMP_KEY);
        /** 如果有缓存且缓存时间大于当前时间(其它进程设置了缓存)，则返回缓存 */
        if (t && +t > now) {
          const vals = await client.hmget(id, ...keys);
          return handleVals(vals);
        }

        let temp = {
          [TIMESTAMP_KEY]: now,
        };

        Object.keys(data).forEach((key) => {
          (temp as Record<string, unknown>)[key] = JSON.stringify(data[key]);
        });
        await client.hset(id, temp);
        this.opts.debug?.hooks?.set?.({ group, tag, id });
        if (expire > 0) {
          await client.expire(id, expire);
        }

        const result = (
          typeof key === 'string' ? data[key] : keys.map((key) => data[key])
        ) as RespFinal;

        (temp as unknown) = null;
        (data as unknown) = null;

        return result;
      });
    };

    return this.idCacheRun(idCacheKey, async () => {
      const [t, ...vals] = await client.hmget(id, TIMESTAMP_KEY, ...keys);
      if (t !== null) {
        return handleVals(vals);
      }
      return await set();
    });
  }
}
