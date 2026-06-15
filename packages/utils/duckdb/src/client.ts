import { fse, getKeys, taskLoop, initQueueTask } from '@repo/utils-node';
import { join, parse } from 'node:path';
import { DuckDBInstance, listValue } from '@duckdb/node-api';
import parquet from '@dsnp/parquetjs';

export type * from '@duckdb/node-api';

import type { DuckDBMaterializedResult, DuckDBValue } from '@duckdb/node-api';
import type { RedisClient } from '@repo/utils-redis';

/**
 * duckdb 连接参数
 *
 * https://duckdb.org/docs/stable/configuration/overview.html
 */
type DuckDbConnectOpts = {
  access_mode?: 'READ_ONLY' | 'READ_WRITE';
  threads?: string;
};

/** 数据模型 */
export type DataModel = {
  [Db in string]: {
    [Table in string]: Record<string, unknown>;
  };
};

type ColItem = {
  /** https://duckdb.org/docs/stable/sql/data_types/numeric#floating-point-types
   *
   * https://www.npmjs.com/package/@dsnp/parquetjs
   *
   * INTEGER: -2^31 to 2^31-1
   * FLOAT: 单精度浮点数（4字节）
   * VARCHAR: 可变长度字符串
   */
  type:
    | 'INTEGER'
    | 'BIGINT'
    | 'VARCHAR'
    | 'FLOAT'
    | 'BOOLEAN'
    | 'TIMESTAMP_MS'
    | 'TIMESTAMP_S';
  /** 主键约束消耗性能，尽量批量导入(导入前去重) */
  primary?: boolean;
};

/** 数据模型(parquet 模式 和 cols 模式) */
export type DuckDbModel<Model extends DataModel> = {
  [Db in keyof Model]: {
    [Table in keyof Model[Db]]: {
      parquet: Record<keyof Model[Db][Table], parquet.FieldDefinition>;
      cols: Record<keyof Model[Db][Table], ColItem>;
    };
  };
};

type DuckDbConfigs<Model extends DataModel> = {
  /** db 文件存储路径，下级目录是 各个 db 的文件夹 */
  dbDir: string;
  /** 模型 */
  model: DuckDbModel<Model>;
  /** redis 客户端，tag 是 db 的文件夹名称 */
  redisClient: RedisClient<'duckdb'>;
  /** db 文件保留时间(毫秒)，默认 1 天，不会清理正在使用中的 db 文件的 */
  dbKeepDuration?: number;
};

type DbSelector<Model extends DataModel, Db extends keyof Model> = {
  /** db 键(主模式) */
  db: Db;
  /** 后缀，传入的视为临时 db */
  suffix?: string | number;
};

// type DbTableSelector<
//   Model extends DataModel,
//   Db extends keyof Model,
//   Table extends keyof Model[Db],
// > = DbSelector<Model, Db> & {
//   /** 表名 */
//   table: Table;
// };

type UseReadOnlyHelperOpts<
  Model extends DataModel,
  Db extends keyof Model,
> = DbSelector<Model, Db> & {
  /** 连接选项（第一次初始化有效） */
  connectOpts?: Omit<DuckDbConnectOpts, 'access_mode'>;
};

type UseReadOnlyOpts<
  Model extends DataModel,
  Db extends keyof Model,
  T extends (body: {
    instance: DuckDBInstance;
    dir: string;
    version: number;
    parquetDir: string;
  }) => Promise<unknown>,
> = UseReadOnlyHelperOpts<Model, Db> & {
  /** 处理逻辑 */
  handler: T;
};

type UseReadWriteHelperOpts<
  Model extends DataModel,
  Db extends keyof Model,
> = UseReadOnlyHelperOpts<Model, Db> & {
  /** db 文件过期时间，设置为 0 就是不过期，单位: 秒!!! */
  expire: number;
};

type UseReadWriteOpts<
  Model extends DataModel,
  Db extends keyof Model,
> = UseReadWriteHelperOpts<Model, Db> & {
  /** 处理逻辑 */
  handler: (body: {
    open: () => Promise<DuckDBInstance>;
    dir: string;
    version: number;
    parquetDir: string;
  }) => Promise<void>;
};

/**
 * https://duckdb.org/docs/stable/connect/concurrency#writing-to-duckdb-from-multiple-processes
 *
 * duckdb 在多进程下无法满足
 *
 * 尝试思路：
 *
 * 1. 不同任务直接使用不同的 db 实例，写入后主动关闭连接, 发送信号，提示切换实例
 * 2. 所有的写入和复制都使用 parquet 方式
 * 3. 信号通过 redis 传递
 */
export class DuckDB<Model extends DataModel> {
  private configs: Required<DuckDbConfigs<Model>>;
  private readonlyInstance: {
    [key in string]?: {
      /** db 文件夹 */
      dir: string;
      /** db 文件夹下的 parquet 文件夹 */
      parquetDir: string;
      /** db 的文件名 */
      val: string;
      /** 版本(同 val 一致, 类型为 number) */
      version: number;
      /** db 实例 */
      instance: Promise<DuckDBInstance>;
    };
  };
  tables: {
    [key in keyof Model]: {
      [table in keyof Model[key]]: string;
    };
  };
  constructor(configs: DuckDbConfigs<Model>) {
    this.configs = {
      dbKeepDuration: 1e3 * 60 * 60 * 24,
      ...configs,
    };
    this.readonlyInstance = {};
    this.cronClear();
    setInterval(() => this.cronClear(), 1e3 * 60 * 60);

    const obj = {} as {
      [key in keyof Model]: {
        [table in keyof Model[key]]: string;
      };
    };
    getKeys(configs.model).forEach((db) => {
      obj[db] = {} as {
        [table in keyof Model[typeof db]]: string;
      };
      getKeys(configs.model[db]).forEach((table) => {
        (obj[db] as any)[table] = table;
      });
    });
    this.tables = obj;
  }
  /** 定时清理过期实例
   *
   * 1. 遍历本地文件夹，判断 redis里 是否存在，不存在则删除db文件，如果被占用则不删除
   * 2. 如果文件夹下没有 db 文件，则删除文件夹
   * 3. 文件夹名称 = DbKey
   */
  private async cronClear() {
    const { dbDir, redisClient } = this.configs;
    if (!(await fse.pathExists(dbDir))) {
      return;
    }

    // TODO: 修正
    return;

    const expire = Date.now() - this.configs.dbKeepDuration;
    const dirs = await fse.readdir(dbDir);

    const min = async (key: string) => {
      const dir = join(dbDir, key);
      const val = await redisClient.get<string>({ group: 'duckdb', tag: key });

      if (val === null && key.includes('.temp.')) {
        await fse.remove(dir);
        return;
      }

      const files = await fse.readdir(dir);
      const needRemove = files.filter((x) => {
        const { name } = parse(x);
        return x.endsWith('.db') && +name < expire && name !== val;
      });
      await Promise.all(needRemove.map((x) => fse.remove(join(dir, x))));
    };

    await taskLoop<typeof min>({
      func: min,
      tasks: dirs.map((x) => [x]),
      options: {
        speed: 10,
      },
    });
  }
  /** 拿到 db 文件夹名称 */
  id(key: keyof Model, suffix?: string | number) {
    if (suffix) {
      return `${key as string}.temp.${suffix}`;
    }
    return key as string;
  }
  /** 获取 db 文件夹 */
  getDir(dbId: string) {
    const dir = join(this.configs.dbDir, dbId);
    return {
      dir,
      parquetDir: join(dir, 'parquet'),
    };
  }
  /**
   * 使用读写模式进行操作，操作完成后(不论成功失败)主动关闭连接(一定记得手动调用)
   */
  useReadWriteHelper<Db extends keyof Model>({
    db,
    suffix,
    expire,
    connectOpts,
  }: UseReadWriteHelperOpts<Model, Db>) {
    const version = Date.now();

    const dbId = this.id(db, suffix);
    const { dir, parquetDir } = this.getDir(dbId);

    let instancePromise: Promise<DuckDBInstance> | undefined = undefined;

    /** 打开实例 */
    const open = async () => {
      if (!instancePromise) {
        const dbFile = join(dir, `${version}.db`);
        const opts: DuckDbConnectOpts = {
          ...connectOpts,
          access_mode: 'READ_WRITE',
        };
        instancePromise = (async () => {
          await fse.ensureDir(dir);
          return await DuckDBInstance.create(dbFile, opts);
        })();
      }
      return await instancePromise;
    };

    /** 关闭实例(是否是因为错误关闭) */
    const close = async (error?: Error) => {
      if (!instancePromise) {
        return;
      }
      let instance = await instancePromise;

      /** 如果没有错误，则执行 checkpoint 和 analyze, 并更新 redis */
      if (!error) {
        await this.query({ instance, query: 'CHECKPOINT' });
        await this.query({ instance, query: 'ANALYZE' });
      }

      instance.closeSync();
      (instance as unknown) = undefined;
      instancePromise = undefined;

      await this.configs.redisClient.set({
        group: 'duckdb',
        tag: dbId,
        callback: async () => version,
        expire,
      });
    };

    return {
      open,
      close,
      dir,
      version,
      parquetDir,
    };
  }
  /** 使用读写模式进行操作，操作完成后主动关闭连接 */
  async useReadWrite<Db extends keyof Model>({
    handler,
    ...opts
  }: UseReadWriteOpts<Model, Db>) {
    const { open, close, ...rest } = this.useReadWriteHelper(opts);
    try {
      await handler({ open, ...rest });
      close();
    } catch (error) {
      close(error as Error);
    }
  }
  /** 使用只读模式进行操作 */
  async useReadOnlyHelper<Db extends keyof Model>({
    db,
    suffix,
    connectOpts,
  }: UseReadOnlyHelperOpts<Model, Db>) {
    const dbId = this.id(db, suffix);
    const val = await this.configs.redisClient.get<string>({
      group: 'duckdb',
      tag: dbId,
    });
    if (!val) {
      throw new Error(`缓存已失效，尝试重新操作`);
    }
    let cur = this.readonlyInstance[dbId];

    if (!cur || cur.val !== val) {
      const { dir, parquetDir } = this.getDir(dbId);
      const dbFile = join(dir, `${val}.db`);
      const opts: DuckDbConnectOpts = {
        threads: '2',
        ...connectOpts,
        access_mode: 'READ_ONLY',
      };
      cur = {
        dir,
        parquetDir,
        val,
        instance: DuckDBInstance.fromCache(dbFile, opts),
        version: +val,
      };
      this.readonlyInstance[dbId] = cur;
    }

    return cur!;
  }
  /** 使用只读模式进行操作 */
  async useReadOnly<
    Db extends keyof Model,
    T extends (body: {
      instance: DuckDBInstance;
      parquetDir: string;
      /** 版本 */
      version: number;
      /** db 目录 */
      dir: string;
    }) => Promise<unknown>,
  >({ handler, ...opts }: UseReadOnlyOpts<Model, Db, T>) {
    const cur = await this.useReadOnlyHelper(opts);
    const { instance, ...rest } = cur;
    const resp = await handler({
      instance: await instance,
      ...rest,
    });
    return resp as Awaited<ReturnType<T>>;
  }
  /** 格式化查询(只能格式化参数，不能是字段、表名、保留字) */
  format(query: string, params: unknown[]) {
    let index = 0;
    const args: unknown[] = [];

    query = query.trim().replace(/\?/g, () => {
      const val = params[index];

      if (Array.isArray(val)) {
        args.push(listValue(val));
      } else {
        args.push(val);
      }
      index += 1;
      return `$${index}`;
    });
    if (args.length !== params.length) {
      throw new Error('params length mismatch');
    }

    return {
      query,
      args,
    };
  }
  /** 基础查询 */
  async query({
    instance,
    query,
    params = [],
  }: {
    instance: DuckDBInstance;
    query: string;
    params?: unknown[];
  }) {
    const connection = await instance.connect();
    if (params?.length) {
      const { query: q, args } = this.format(query, params);
      const prepared = await connection.prepare(q);
      prepared.bind(args as DuckDBValue[]);
      return await prepared.run();
    } else {
      return await connection.run(query);
    }
  }
  /** 获取结果行 */
  async rows<T = Record<string, unknown>>(val: DuckDBMaterializedResult) {
    return (await val.getRowObjectsJS()) as T[];
  }
  // /** 清空表 */
  // async clear({ instance, name }: { instance: DuckDBInstance; name: string }) {
  //   const query = `TRUNCATE TABLE ${name}`;
  //   return await this.query({ instance, query });
  // }
  // /** 删除表 */
  // async drop({ instance, name }: { instance: DuckDBInstance; name: string }) {
  //   const query = `DROP TABLE IF EXISTS ${name}`;
  //   return await this.query({ instance, query });
  // }
  // /** 查询表列表 */
  // async listTables({ instance }: { instance: DuckDBInstance }) {
  //   return await this.query({
  //     instance,
  //     query: 'select table_name from information_schema.tables',
  //   });
  // }
  /** 创建表 */
  async create({
    instance,
    name,
    cols,
  }: {
    instance: DuckDBInstance;
    name: string;
    cols: Record<string, ColItem>;
  }) {
    const query = `
    CREATE TABLE ${name} (
      ${getKeys(cols)
        .map((col) => {
          const { type, primary } = cols[col];
          let str = `"${col}" ${type}`;
          if (primary) {
            str += ' PRIMARY KEY';
          }
          return str;
        })
        .join()}
    )
    `;
    return await this.query({ instance, query });
  }
  /** 批量插入数据（Parquet方式）
   *
   * 务必保证列顺序一致
   */
  async parquetFrom({
    instance,
    name,
    file,
    cols,
  }: {
    instance: DuckDBInstance;
    name: string;
    file: string;
    cols?: string[];
  }) {
    return await this.query({
      instance,
      query: `COPY ${name} ${cols?.length ? `(${cols.map((x) => `"${x}"`).join(',')})` : ''} FROM '${file}' (FORMAT parquet)`,
    });
  }
  /** DB 批量导入辅助函数, 一定记得调用 dispose 方法 */
  useDbImportHelper<Db extends keyof Model>({
    db,
    suffix,
    compression = 'SNAPPY',
    readWriteHelperOpts,
    modelsForce,
  }: DbSelector<Model, Db> & {
    /** readWrite 选项 */
    readWriteHelperOpts: Omit<
      UseReadWriteHelperOpts<Model, Db>,
      'suffix' | 'db'
    >;
    /** parquet 压缩方式 */
    compression?: parquet.ParquetCompression;
    modelsForce?: Partial<DuckDbModel<Model>[Db]>;
  }) {
    type Table = keyof Model[Db];

    const { open, close, parquetDir } = this.useReadWriteHelper({
      db,
      suffix,
      ...readWriteHelperOpts,
    });

    const dbModel = {
      ...this.configs.model[db],
      ...modelsForce,
    };
    const dbParquetSchema = new Map<Table, parquet.ParquetSchema>();

    /** 获取表的 parquet 模式 */
    const getTableParquetSchema = (table: Table) => {
      let schema = dbParquetSchema.get(table);
      if (!schema) {
        let temp = {} as Record<string, parquet.FieldDefinition>;
        getKeys(dbModel[table].parquet).forEach((key) => {
          temp[key as string] = {
            compression,
            ...dbModel[table].parquet[key],
          };
        });
        schema = new parquet.ParquetSchema(temp);
        (temp as unknown) = null;
        dbParquetSchema.set(table, schema);
      }
      return schema;
    };

    const create = async <T extends Table>(table: T) => {
      await this.create({
        instance: await open(),
        name: table as string,
        cols: dbModel[table].cols,
      });
    };

    const useWrite = <T extends Table>({
      table,
      file,
      opts,
      batchSize = 1e3 * 2,
    }: {
      table: T;
      file: string;
      opts?: parquet.WriterOptions;
      batchSize?: number;
    }) => {
      let writerPromise: Promise<parquet.ParquetWriter> | undefined = undefined;
      const taskItems: Model[Db][T][] = [];
      const promiseList: Promise<void>[] = [];

      const open = async () => {
        if (!writerPromise) {
          writerPromise = parquet.ParquetWriter.openFile(
            getTableParquetSchema(table),
            file,
            opts,
          );
        }
        return await writerPromise;
      };

      const insert = initQueueTask(
        async (data: Model[Db][T][]) => {
          const writer = await open();
          const length = data.length;
          for (let i = 0; i < length; i++) {
            await writer!.appendRow(data[i]);
          }
          data.length = 0;
        },
        {
          worker: 1,
        },
      );

      /** 运行任务 */
      const run = (force?: boolean) => {
        if (!taskItems.length) {
          return;
        }
        if (taskItems.length >= batchSize || force) {
          const data = taskItems.slice();
          taskItems.length = 0;
          promiseList.push(insert(data));
        }
      };

      const push = (list: Model[Db][T] | Model[Db][T][]) => {
        if (Array.isArray(list)) {
          taskItems.push(...list);
        } else {
          taskItems.push(list);
        }
        run();
      };

      const done = async () => {
        await open();
        run(true);
        await Promise.all(promiseList);

        if (!writerPromise) {
          return;
        }
        const writer = await writerPromise;
        await writer.close();

        promiseList.length = 0;
        taskItems.length = 0;
        writerPromise = undefined;
      };

      return {
        push,
        done,
      };
    };

    const write = async <T extends Table>({
      table,
      data,
      file,
      opts,
    }: {
      table: Table;
      data: Model[Db][T][];
      file: string;
      opts?: parquet.WriterOptions;
    }) => {
      const writer = await parquet.ParquetWriter.openFile(
        getTableParquetSchema(table),
        file,
        opts,
      );
      const length = data.length;
      for (let i = 0; i < length; i++) {
        await writer.appendRow(data[i]);
      }
      data.length = 0;
      await writer.close();
    };

    const copy = async <Table extends keyof Model[Db]>({
      table,
      file,
    }: {
      table: Table;
      file: string;
    }) => {
      await this.parquetFrom({
        instance: await open(),
        name: table as string,
        file,
        cols: getKeys(dbModel[table].parquet) as string[],
      });
    };

    const dispose = async () => {
      dbParquetSchema.clear();
      await close();
    };

    return {
      /** 创建表 */
      create,
      /** 写入数据到 parquet 文件 会清除 data */
      write,
      /** 写入数据到 parquet 文件, 会清除 data */
      useWrite,
      /**
       * 从 parquet 文件中数据到表
       *
       * 1. 如果提供了 data，则将 data 写入 parquet 文件，然后导入 parquet 文件到 duckdb
       * 2. 如果没有提供 data，则直接导入 parquet 文件到 duckdb
       * 3. 会清除 data
       */
      copy,
      /** 关闭实例, 清除占用，一定记得调用 */
      dispose,
      /** parquet 目录 */
      parquetDir,
    };
  }
}
