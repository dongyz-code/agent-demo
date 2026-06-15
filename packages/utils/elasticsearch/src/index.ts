import { Client } from '@elastic/elasticsearch';
import { fse, arrChunk, getKeys, reTryFunc, taskLoop } from '@repo/utils-node';
import { getProperties } from './properties.js';
import { healthCheck, baseTransportRequestOptions } from './utils.js';
import { join } from 'node:path';

import type { estypes } from '@elastic/elasticsearch';
import type { BeString } from '@repo/types';
import type { BasePropertyWithNested } from './type.js';
import type { TransportRequestOptions } from './utils.js';

export { ES_BASE_PROPERTIES } from './properties.js';
export { baseTransportRequestOptions } from './utils.js';

export type * from './type.js';

type TryToBeString<T> = T extends string
  ? string
  : T extends Record<string, unknown>[]
    ? keyof T[number]
    : never;

/** 嵌套字段获取 */
type TryToBeNestedKey<T, K extends string> = T extends Record<string, unknown>[]
  ? `${K}.${BeString<keyof T[number]>}` | K
  : K;

/** 传入配置 */
export type Opts<Data extends Record<string, Record<string, unknown>>> = {
  /** node 配置 */
  client: ConstructorParameters<typeof Client>[0];
  /** 数据配置 */
  dataConfigs: {
    [key in keyof Data]: {
      /** 字段类型配置 */
      properties: {
        [key2 in keyof Data[key]]: BasePropertyWithNested<
          TryToBeString<Data[key][key2]>
        >;
      };
      /** 主键 */
      _id: keyof Data[key];
      /** 创建索引时的额外配置 */
      createOpts?: Omit<estypes.IndicesCreateRequest, 'index'>;
    };
  };
  /** 索引命名规则，强制提供, 会强制变更为小写, trim */
  indexName: (body: { key: keyof Data; alias?: string }) => string;
  /** 索引元信息存储，提供绝对路径，用于检测到配置变更，强制重建索引 */
  metaDir: string;
  /** 默认请求选项(超时等配置) */
  options?: () => TransportRequestOptions;
};

/** 建立索引后才写入配置！ */
type MetaData<Data extends Record<string, Record<string, unknown>>> = {
  /** 当前版本的元数据 */
  dataConfigs: {
    [key in keyof Data]: {
      /** 创建索引的配置选项 */
      createOpts: (body: { index: string }) => estypes.IndicesCreateRequest;
    };
  };
};

type DataOpts<Data extends Record<string, Record<string, unknown>>> = {
  [key in keyof Data]: {
    cols: Record<keyof Data[key], string>;
    colsWithNested: Record<
      keyof {
        [key2 in keyof Data[key] as TryToBeNestedKey<
          Data[key][key2],
          `${BeString<key2>}`
        >]: string;
      },
      string
    >;
  };
};

export class EsSearch<Data extends Record<string, Record<string, unknown>>> {
  client: Client;
  private opts: Opts<Data>;
  private health: Promise<MetaData<Data>> | undefined;
  dataOpts: DataOpts<Data>;
  constructor(opts: Opts<Data>) {
    this.client = new Client(opts.client);
    this.opts = opts;
    this.dataOpts = (() => {
      const temp = {} as DataOpts<Data>;
      getKeys(opts.dataConfigs).forEach((key) => {
        const item = {
          cols: {},
          colsWithNested: {},
        } as DataOpts<Data>[typeof key];
        const properties = this.opts.dataConfigs[key].properties;
        getKeys(properties).forEach((key) => {
          Object.assign(item.cols, { [key]: key });
          Object.assign(item.colsWithNested, { [key]: key });

          const val = properties[key];
          if (
            typeof val === 'object' &&
            'role' in val &&
            val.role === 'es.nested'
          ) {
            getKeys(val.data).forEach((key2) => {
              const nestedKey = `${key as string}.${key2 as string}`;
              Object.assign(item.colsWithNested, {
                [nestedKey]: nestedKey,
              });
            });
          }
        });
        temp[key] = item;
      });
      return temp;
    })();
  }
  /** 默认请求选项 */
  private options(extra?: TransportRequestOptions) {
    return baseTransportRequestOptions({
      ...this.opts.options?.(),
      ...extra,
    });
  }
  /** 健康检测及元数据读取 */
  private async ready() {
    if (!this.health) {
      this.health = (async () => {
        const keys = getKeys(this.opts.dataConfigs);

        await Promise.all([
          healthCheck({
            label: 'ES',
            verify: async () => {
              await this.client.cluster.health({}, this.options());
              return true;
            },
            retry: 3,
          }),
          ...keys.map((key) =>
            fse.ensureDir(join(this.opts.metaDir, key as string)),
          ),
        ]);

        const meta = {
          dataConfigs: {},
        } as MetaData<Data>;

        keys.forEach((key) => {
          const {
            properties,
            createOpts: { mappings = {}, ...restOpts } = {},
          } = this.opts.dataConfigs[key];
          const { properties: _, ...mappingsRest } = mappings;

          meta.dataConfigs[key] = {
            createOpts: ({ index }) => {
              const createOpts: estypes.IndicesCreateRequest = {
                index,
                mappings: {
                  properties: getProperties(properties),
                  ...mappingsRest,
                },
                ...restOpts,
              };
              return createOpts;
            },
          };
        });

        return meta;
      })();
    }
    return await this.health;
  }
  /** 获取索引名称 */
  getIndex<Key extends keyof Data>(body: { key: Key; alias?: string }) {
    return this.opts.indexName(body).trim().toLowerCase();
  }
  /** 创建索引 校验配置
   *
   * 1. 判断索引是否存在，如果存在且配置一致，跳过
   * 2. 否则删除重建索引
   */
  async createIndex<Key extends keyof Data>({
    key,
    alias,
    protect = true,
    options,
  }: {
    key: Key;
    /** 多个命名索引共享配置 */
    alias?: string;
    /** 保护索引，不删除目标索引 */
    protect?: boolean;
    /** 请求选项 */
    options?: TransportRequestOptions;
  }) {
    const { dataConfigs } = await this.ready();

    const index = this.getIndex({ key, alias });
    const metaJson = join(this.opts.metaDir, key as string, index);
    const createOpts = dataConfigs[key].createOpts({ index });

    /** 判断索引是否存在，如果存在且配置一致，跳过 */
    const indexExist = await this.client.indices.exists(
      { index },
      this.options(options),
    );
    if (indexExist) {
      /** 是否需要重建 */
      const needRebuild = await (async () => {
        if (await fse.pathExists(metaJson)) {
          return (
            JSON.stringify(createOpts) !==
            (await fse.readFile(metaJson, 'utf8'))
          );
        }
        return true;
      })();

      if (!needRebuild) {
        return {
          status: 'SKIP' as const,
        };
      }
      if (protect) {
        console.error(
          `${key as string} 索引结构变更，需要重建！但保护索引，跳过！`,
        );
        return {
          status: 'SKIP' as const,
        };
      }
    }

    /** 删除旧的索引 */
    if (indexExist) {
      await this.client.indices.delete({ index }, this.options(options));
      console.error(
        `${key as string} 索引结构变更，需要重建！已删除: ${index}`,
      );
    }

    /** 创建新索引 */
    await this.client.indices.create(createOpts, this.options(options));
    await fse.writeJSON(metaJson, createOpts);

    return {
      status: 'CREATE' as const,
    };
  }
  /** 索引是否存在 */
  async existsIndex<Key extends keyof Data>({
    key,
    alias,
    options,
  }: {
    key: Key;
    /** 多个命名索引共享配置 */
    alias?: string;
    /** 请求选项 */
    options?: TransportRequestOptions;
  }) {
    await this.ready();
    const index = this.getIndex({ key, alias });
    return await this.client.indices.exists({ index }, this.options(options));
  }
  /** 删除索引 */
  async deleteIndex<Key extends keyof Data>({
    key,
    alias,
    options,
  }: {
    key: Key;
    /** 多个命名索引共享配置 */
    alias?: string;
    /** 请求选项 */
    options?: TransportRequestOptions;
  }) {
    await this.ready();
    const index = this.getIndex({ key, alias });
    return await this.client.indices.delete({ index }, this.options(options));
  }
  /** 批量导入数据, 包含了重试 */
  async bulkIndex<T extends keyof Data>({
    key,
    alias,
    step = 500,
    worker = 2,
    lastRefresh = true,
    options,
    ...body
  }: {
    key: T;
    /** 多个命名索引共享配置 */
    alias?: string;
    /** 每次 bulk 的文档数量 */
    step?: number;
    /** bulk 请求并发数上限 */
    worker?: number;
    /** 本批次最后的数据插入后，是否刷新文档 */
    lastRefresh?: boolean;
    /** 请求选项 */
    options?: TransportRequestOptions;
  } & (
    | {
        /** JSON 文件 */
        file: string;
      }
    | {
        data: Data[T][];
      }
  )) {
    await this.ready();

    const index = this.getIndex({ key, alias });

    /** 一直等待索引新建完毕，避免自动生成了新的索引 */
    await healthCheck({
      label: '等待新建索引',
      verify: async () => {
        return await this.client.indices.exists(
          { index },
          this.options(options),
        );
      },
    });

    const data: Data[T][] =
      'file' in body ? await fse.readJSON(body.file) : body.data;

    if (!data.length) {
      return 0;
    }

    const { _id } = this.opts.dataConfigs[key];
    const chunks = arrChunk(data, step);
    const count = data.length;

    const insert = async (items: Data[T][], refresh: boolean) => {
      const operations: NonNullable<estypes.BulkRequest['operations']> = [];
      items.forEach((item) => {
        operations.push({
          index: { _index: index, _id: item[_id] },
        });
        operations.push(item);
      });
      const bulkRequest: estypes.BulkRequest = {
        index,
        operations,
        timeout: '10m',
        refresh,
      };
      const bulkResp = await this.client.bulk(
        bulkRequest,
        this.options(options),
      );
      if (bulkResp.errors) {
        const msg =
          bulkResp?.items[0]?.index?.error?.reason ?? 'bulk index error!';
        throw new Error(msg);
      }
      items.length = 0;
    };

    const insertRetry = reTryFunc(insert, {
      label: index.toUpperCase(),
      count: 3,
      /** 留出 shards failed 恢复时间 */
      duration: 1e3 * 60 * 2,
    });

    await taskLoop<typeof insertRetry>({
      func: insertRetry,
      tasks: chunks.map((x, index) => [
        x,
        lastRefresh && index === chunks.length - 1,
      ]),
      options: {
        speed: worker,
      },
    });

    return count;
  }
  /** 批量删除文档 */
  async bulkDelete<T extends keyof Data>({
    key,
    alias,
    _ids,
    refresh = true,
    options,
  }: {
    key: T;
    /** 多个命名索引共享配置 */
    alias?: string;
    _ids: string[];
    refresh?: boolean;
    options?: TransportRequestOptions;
  }) {
    await this.ready();

    if (!_ids.length) {
      return;
    }
    const operations: NonNullable<estypes.BulkRequest['operations']> = [];
    const index = this.getIndex({ key, alias });
    _ids.forEach((_id) => {
      operations.push({ delete: { _index: index, _id: _id } });
    });
    const bulkRequest: estypes.BulkRequest = {
      index,
      operations,
      refresh,
    };
    const bulkResp = await this.client.bulk(bulkRequest, this.options(options));
    if (bulkResp.errors) {
      const msg =
        bulkResp?.items[0]?.delete?.error?.reason ?? 'bulk delete error!';
      throw new Error(msg);
    }
    return;
  }
  /** 批量更新文档 */
  async bulkUpdate<T extends keyof Data>({
    key,
    alias,
    data,
    refresh = true,
    options,
  }: {
    key: T;
    /** 多个命名索引共享配置 */
    alias?: string;
    data: {
      _id: string;
      update: Partial<Data[T]>;
    }[];
    refresh?: boolean;
    options?: TransportRequestOptions;
  }) {
    await this.ready();

    if (!data.length) {
      return;
    }

    const operations: NonNullable<estypes.BulkRequest['operations']> = [];
    const index = this.getIndex({ key, alias });

    data.forEach(({ _id, update }) => {
      operations.push({ update: { _index: index, _id } });
      operations.push({ doc: update });
    });

    const conf: estypes.BulkRequest = {
      index,
      operations,
      refresh,
    };

    const bulkResp = await this.client.bulk(conf, this.options(options));
    if (bulkResp.errors) {
      const msg =
        bulkResp?.items[0]?.update?.error?.reason ?? 'bulk update error!';
      throw new Error(msg);
    }
    return bulkResp;
  }
  /** 刷新文档 */
  async refreshIndex<T extends keyof Data>({
    key,
    alias,
    options,
  }: {
    key: T;
    /** 多个命名索引共享配置 */
    alias?: string;
    /** 请求选项 */
    options?: TransportRequestOptions;
  }) {
    await this.ready();
    const index = this.getIndex({ key, alias });
    return await this.client.indices.refresh({ index }, this.options(options));
  }
  /** 辅助函数 检索 */
  async helperFilter<
    T extends keyof Data,
    Callback extends (
      body: {
        index: string;
        client: Client;
        TYPE_ITEM: Data[T];
        /** 请求选项 */
        options: TransportRequestOptions;
      } & Pick<DataOpts<Data>[T], 'cols' | 'colsWithNested'>,
    ) => Promise<unknown>,
  >({
    key,
    alias,
    callback,
    options,
  }: {
    key: T;
    /** 多个命名索引共享配置 */
    alias?: string;
    callback: Callback;
    options?: TransportRequestOptions;
  }) {
    await this.ready();

    const { cols, colsWithNested } = this.dataOpts[key];

    const index = this.getIndex({ key, alias });
    const resp = await callback({
      index,
      cols,
      colsWithNested,
      client: this.client,
      TYPE_ITEM: {} as Data[T],
      options: this.options(options),
    });

    return resp as Awaited<ReturnType<Callback>>;
  }
  /** 辅助函数 计数 */
  async helperCount<T extends keyof Data>({
    key,
    alias,
    filter,
    options,
  }: {
    key: T;
    /** 多个命名索引共享配置 */
    alias?: string;
    filter: estypes.QueryDslQueryContainer[];
    options?: TransportRequestOptions;
  }) {
    await this.ready();
    const { count } = await this.client.count(
      {
        index: this.getIndex({ key, alias }),
        query: {
          bool: {
            filter,
          },
        },
      },
      this.options(options),
    );
    return count;
  }
  useEsRefreshIndexData<T extends keyof Data>({
    key,
    alias,
    version,
    bulkStep = 200,
    bulkWorker = 1,
    protect = true,
    prefixSetting,
    suffixSetting,
    options,
  }: {
    key: T;
    alias?: string;
    version: number;
    /** 批量写入的步长 */
    bulkStep?: number;
    /** 批量写入的并发数 */
    bulkWorker?: number;
    /** 保护索引，不删除目标索引 */
    protect?: boolean;
    /** bulk 前设置 */
    prefixSetting?: estypes.IndicesIndexSettings;
    /** bulk 后设置 */
    suffixSetting?: estypes.IndicesIndexSettings;
    options?: TransportRequestOptions;
  }) {
    let ready: undefined | Promise<void> = undefined;

    const counts = {
      /** bulk 调用次数 */
      step: 0,
      /** 插入记录数 */
      total: 0,
    };

    const index = this.getIndex({ key, alias });

    const create = async () => {
      await this.createIndex({ key, alias, protect, options });
      /** 配置修正 */
      await this.client.indices.putSettings(
        {
          index,
          settings: {
            refresh_interval: -1,
            ...prefixSetting,
          },
        },
        baseTransportRequestOptions(options),
      );
    };

    const bulk = async (data: Data[T][]) => {
      if (!ready) {
        ready = create();
      }
      await ready;

      counts.step += 1;
      counts.total += data.length;

      await this.bulkIndex({
        key,
        data,
        lastRefresh: false,
        step: bulkStep,
        worker: bulkWorker,
        options,
      });
    };

    const done = async (opts?: { remove: boolean }) => {
      if (!ready) {
        ready = create();
      }
      await ready;

      /** 配置修正 */
      await this.client.indices.putSettings(
        {
          index,
          settings: {
            refresh_interval: '60s',
            ...suffixSetting,
          },
        },
        baseTransportRequestOptions(options),
      );

      /** 删除旧数据 */
      if (opts?.remove) {
        await this.client.deleteByQuery(
          {
            index,
            conflicts: 'proceed',
            query: {
              bool: {
                filter: [
                  {
                    range: {
                      version: {
                        lt: version,
                      },
                    },
                  },
                ],
              },
            },
            refresh: false,
          },
          baseTransportRequestOptions(options),
        );
      }

      /** 手动执行一次刷新任务（数量量很大的情况下会比较慢） */
      await this.refreshIndex({ key, alias, options });
    };

    return {
      /** 插入数据，已经包含了重试 */
      bulk,
      /** 插入完成后调用，刷新索引，删除旧数据（版本低于当前版本的） */
      done,
      /** 索引 KEY */
      key,
      /** 索引名称 */
      index,
      /** 统计 */
      counts,
      /** 版本 */
      version,
    };
  }
}
