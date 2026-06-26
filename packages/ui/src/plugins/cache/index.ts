/**
 * 内存缓存
 */
import { arrUnique, arrObject } from '@repo/utils-browser';
import { computed, shallowRef } from 'vue';

import type { ComputedRef, ShallowRef } from 'vue';
import type { Simplify } from '../../types/index';

type GetForm<T extends string | number = string> = {
  /** 按ID列表获取，ID 默认仅数字或者字符串类型（其一），其它类型会忽略 */
  ids?: T[];
  /** 是否是全量获取 */
  full?: boolean;
};

type Opt<
  T extends (
    form: GetForm<U extends true ? number : string>,
  ) => Promise<unknown[]>,
  K extends keyof Awaited<ReturnType<T>>[number],
  U extends boolean = false,
> = {
  /** 获取逻辑 */
  get: T;
  /** get 获取到的列表中，对象的主键 */
  key: K;
  /** 主键对应的 label 字段 */
  label: K;
  /** 是否是数字作为 ID */
  numId?: U;
  /** 合并 get 获取, 传入毫秒数。每次触发 get，会等待 wait, 如何有新的请求，按逻辑进行合并（全量获取不合并）
   *
   * 传入 0 意味着不合并请求
   */
  wait?: number;
};

export class CacheById<
  T extends (
    form: GetForm<U extends true ? number : string>,
  ) => Promise<Record<string, unknown>[]>,
  K extends keyof Awaited<ReturnType<T>>[number],
  U extends boolean = false,
> {
  /** 如何传入的是 非法的ID ，结果默认为 null */
  private $data: {
    [key: string]: Promise<Awaited<ReturnType<T>>[number] | null>;
  };
  /** 全量数据是否 ready */
  private $fullReady?: Promise<unknown>;
  /** 按 ID 获取的队列 */
  private $dataQueue: {
    list: (U extends true ? number : string)[];
    promiseList: Record<string, Promise<string>>;
  };
  /** 传入的配置 */
  private $config: Opt<T, K, U>;
  /** ------------------------- */
  /** mapping, ID 映射，可能为空，null */
  mapping: ShallowRef<Record<string, Awaited<ReturnType<T>>[number] | null>>;
  /** 原始数据列表，过滤ID映射不到的空数据 */
  data: ComputedRef<Awaited<ReturnType<T>>>;
  /** select 选项，过滤ID映射不到的空数据 */
  selectOptions: ComputedRef<
    {
      label: string;
      value: U extends true ? number : string;
      self: Awaited<ReturnType<T>>[number];
    }[]
  >;
  constructor(config: Opt<T, K, U>) {
    this.$data = {};
    config.wait = config.wait ?? 200;
    this.$config = config;
    this.$dataQueue = { list: [], promiseList: {} };
    /** ------------ */
    this.mapping = shallowRef({});
    this.data = computed(() => {
      const list = Object.values(this.mapping.value).filter(
        (x) => x,
      ) as Awaited<ReturnType<T>>;
      return list;
    });
    this.selectOptions = computed(() => {
      const list = this.data.value;
      return list.map((item) => ({
        label: item[config.label as string] as string,
        value: item[this.$config.key as string] as U extends true
          ? number
          : string,
        self: item,
      }));
    });
  }
  /** 获取信息 By ID, 默认会过滤掉没有映射上的数据 */
  async get<Filter extends boolean = true>({
    ids = [],
    full,
    filter,
    refresh = false,
  }: Parameters<Opt<T, K, U>['get']>[0] & {
    /** 过滤掉没有映射上的数据 */
    filter?: Filter;
    /** 强制刷新 */
    refresh?: boolean;
  }) {
    type Val = Simplify<Awaited<ReturnType<T>>[number] | null>;
    type CVal = Filter extends false ? Val : NonNullable<Val>;

    let res: Val[];

    /** 全量获取会清除ID的缓存 */
    if (full) {
      if (!this.$fullReady || refresh) {
        this.$fullReady = new Promise<number>((resolve, reject) => {
          this.$config
            .get({ full })
            .then((data) => {
              this.$data = {};
              data
                .filter((x) => x)
                .forEach((item) => {
                  const id = item[this.$config.key as string] as string;
                  this.$data[id] = new Promise((resolve) => resolve(item));
                });
              resolve(1);
            })
            .catch(reject);
        });
      }
      await this.$fullReady;
      res = await Promise.all(Object.values(this.$data));
      this.mapping.value = arrObject(
        res.filter((x) => x) as Record<string, unknown>[],
        this.$config.key as string,
      );
    } else {
      /** ------- ids 处理 --------- */
      if (!ids.length) {
        return [];
      }
      ids = arrUnique(ids);

      /** 防抖，最后一次才会提交 GET ，但是前面的也需要等待最后一次触发GET */
      /**
       * 1. 每一次获取都生成一个 Promise 放到 promiseList 列表里面 (默认睡眠 200ms)，该 Promise 执行完毕后就移除
       * 2. 每次移除后，尝试移出 Promise （从头）, 如果存在，等待 Promise 执行完成, 继续循环
       * 3. promiseList 空了，最后一个 promise 会产生 GET 请求
       */
      await (async () => {
        /** 最后一次请求才调用 */
        const get = (_ids: typeof ids) => {
          if (!_ids.length) {
            return;
          }
          _ids = arrUnique(_ids);
          const promise = this.$config.get({ ids: _ids });
          _ids.forEach((id) => {
            this.$data[id] = new Promise((resolve, reject) => {
              promise
                .then((data) => {
                  const item = data.find(
                    (e) => e && e[this.$config.key as string] === id,
                  );
                  resolve(item as Awaited<ReturnType<T>>[number]);
                })
                .catch(reject);
            });
          });
          promise.then((data) => {
            this.mapping.value = {
              ...this.mapping.value,
              ...arrObject(data, this.$config.key as string),
            };
          });
        };
        const filterIds = refresh
          ? ids
          : ids.filter((id) => this.$data[id] === undefined);

        /** 单次请求 */
        if (!this.$config.wait) {
          get(filterIds);
          return;
        }

        /** merge */
        this.$dataQueue.list.push(...filterIds);
        const promiseId = '' + Date.now() + Math.random();

        this.$dataQueue.promiseList[promiseId] = new Promise((resolve) => {
          setTimeout(() => {
            delete this.$dataQueue.promiseList[promiseId];
            resolve(promiseId);
          }, this.$config.wait);
        });

        const promiseList = this.$dataQueue.promiseList;

        /** 这里一定会等待所有的都执行完毕，理论上最后一次的 promise 是最后执行完成的（都是睡眠） */
        async function loop(lastPromiseId: string): Promise<string> {
          const list = Object.values(promiseList);
          if (list.length) {
            const id = await list[0];
            return await loop(id as string);
          }
          return lastPromiseId;
        }

        const lastPromiseId = await loop(promiseId);

        if (promiseId === lastPromiseId) {
          const ids = [...this.$dataQueue.list];
          this.$dataQueue.list.length = 0;
          get(ids);
        }
      })();

      // console.log(ids);

      /** 当次请求的结果 */
      res = await Promise.all(ids.map((x) => this.$data[x]!));
    }

    if (filter !== false) {
      return res.filter((x) => x) as CVal[];
    }
    return res as CVal[];
  }
  /** 直接设置对应的结果，传入 get 获取到的列表 */
  setMapping(data: Awaited<ReturnType<T>>) {
    data.forEach((item) => {
      const id = item[this.$config.key as string] as string;
      this.$data[id] = new Promise((resolve) => resolve(item));
    });
    this.mapping.value = {
      ...this.mapping.value,
      ...arrObject(data, this.$config.key as string),
    };
  }
  /** 清空缓存 */
  clear() {
    this.$data = {};
    this.mapping.value = {};
    delete this.$fullReady;
  }
}
