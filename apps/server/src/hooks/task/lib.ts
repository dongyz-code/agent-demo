import { randomUUID } from 'node:crypto';
import { NdGz, getKeys, spawnAsync, spawnNodeAsync } from '@repo/utils-node';
import {
  countRows,
  db,
  listFilter,
  rangeFilter,
  schema,
  searchFilter,
  whereAll,
} from '@/database/index.js';
import { count, desc, eq, inArray } from 'drizzle-orm';

import type { ChildProcessExtraOpts, Stats } from '@repo/utils-node';
import type { BeString } from '@/types/index.js';
import type { SqlData, SqlInsertData } from '@/database/index.js';
import type { ApiSys } from '@/types/index.js';

const ndGz = new NdGz();
const jsonArrayJsonToGzbuffer = ndGz.arrToNdGzBuffer.bind(ndGz);
const jsonArrayGzbufferToJson = ndGz.gzBufferToArr.bind(ndGz);

type TaskSqlItem = SqlData['tasks'];
type TaskSqlInsertItem = SqlInsertData['tasks'];

/** 参数, 事件传递过去的都是字符串哈 */
type ArgVal = string | number | Record<string, unknown>;

type TaskScriptBase<
  T extends ArgVal[],
  K extends { optionKey: string } = { optionKey: string },
> = ChildProcessExtraOpts & {
  /** 任务组名 */
  group: string;
  /** 任务名称如何构造（可选） */
  task_name?: (body: {
    /** 任务组 */
    group: string;
    /** 任务ID */
    task_id: string;
    /** 脚本追加的参数 */
    args: T;
  }) => string;
  /** 构造任务搜索关键词（可选） */
  search_key?: (body: {
    /** 任务组 */
    group: string;
    /** 任务ID */
    task_id: string;
    /** 脚本追加的参数 */
    args: T;
  }) => string;
  pending_uuid_make?: (body: {
    /** 任务组 */
    group: string;
    /** 任务ID */
    task_id: string;
    /** 脚本追加的参数 */
    args: T;
  }) => string;
  /** 参数模式 */
  argsMode?: ApiSys.TaskArgItem<K>[];
  /** 是否允许前端主动提交 */
  allowFrontendSubmit?: boolean;
} & (
    | {
        /** ---------- node 文件脚本 ----------*/
        role: 'node';
        /** node 脚本所在目录 */
        dir: string;
        /** node 脚本文件名(无后缀) */
        filename: string;
      }
    | {
        /** ---------- 非 node 文件脚本 ---------- */
        role: 'cmd';
        /** 脚本执行命令 */
        cmd: string;
      }
  );

type TaskScript<
  T extends ArgVal[],
  K extends { optionKey: string } = { optionKey: string },
> = TaskScriptBase<T, K> & {
  /** 脚本需要追加的参数类型（仅类型） */
  EXTRA_ARGS_TYPE: T;
};

export function helperScript<
  T extends ArgVal[],
  K extends { optionKey: string } = { optionKey: string },
>(scripts: TaskScriptBase<T, K>) {
  return {
    ...scripts,
    EXTRA_ARGS_TYPE: [] as any,
  } as TaskScript<T, K>;
}

type TaskItem<K extends string> = {
  task_id: string;
  key: K;
  resolve: (value: { stats: Stats }) => void;
  reject: (reason?: any) => void;
  /** 脚本追加的参数 */
  args: ArgVal[];
};

type TaskScripts = Record<string, TaskScript<any>>;

type Opts<T extends TaskScripts> = {
  /** 任务列表 */
  scripts: T;
  /** 队列长度，默认 30 */
  worker?: number;
  /** 先入先出（FIFO） 先入后出（LIFO ） */
  queue?: 'FIFO' | 'LIFO';
};

type SqlFilter = ApiSys.TaskSqlFilter;

function getSqlFilter(form: SqlFilter) {
  return whereAll(
    listFilter(schema.tasks.status, form.status),
    searchFilter(form.search?.trim(), [schema.tasks.search_key]),
    listFilter(schema.tasks.task_key, form.key),
    listFilter(schema.tasks.trigger_method, form.trigger_method),
    rangeFilter(schema.tasks.create_timestamp, form.create_timestamp),
  );
}

const convert = (val: ArgVal) => {
  if (typeof val === 'string') {
    return val;
  } else if (typeof val === 'number') {
    return val + '';
  } else {
    return JSON.stringify(val);
  }
};
function handleArgs(vals: ArgVal[]) {
  return vals.map(convert);
}

export class InitTaskRun<T extends TaskScripts> {
  /** 任务列表 */
  private tasks: TaskItem<BeString<keyof T>>[];
  /** 配置选项 */
  private opts: Required<Opts<T>>;
  /** 空闲的 worker 数量 */
  private idleWorker: number;
  /** 执行中的任务（临时存储） */
  private pendingTask: Record<string, Awaited<ReturnType<typeof spawnAsync>>>;
  constructor(opts: Opts<T>) {
    this.opts = {
      worker: 50,
      queue: 'FIFO',
      ...opts,
    };
    this.idleWorker = this.opts.worker;
    this.tasks = [];
    this.pendingTask = {};
  }
  /** 添加任务 */
  async add<K extends keyof T>(
    body:
      | {
          /** TASK KEY */
          key: BeString<K>;
          /** 脚本需要追加的参数 */
          args: T[K]['EXTRA_ARGS_TYPE'];
          /** sql */
          sqlInfo: Pick<TaskSqlItem, 'execution_user_id' | 'trigger_method'>;
        }
      | {
          /** 历史任务, 继续执行的情况 */
          history_task_id: string;
        },
  ) {
    type Detail = {
      args: ArgVal[];
    };

    const checkPending = async (
      {
        pending_uuid,
        task_key,
      }: {
        pending_uuid: string | null;
        task_key: string;
      },
      query: Pick<typeof db, 'select'>,
    ) => {
      if (pending_uuid === null) {
        return;
      }
      const [row] = await query
        .select({ count: count() })
        .from(schema.tasks)
        .where(
          whereAll(
            eq(schema.tasks.pending_uuid, pending_uuid),
            eq(schema.tasks.task_key, task_key),
            eq(schema.tasks.status, 'pending'),
          ),
        );
      if (row?.count) {
        throw new Error('存在互斥任务，无法重复添加');
      }
    };

    const data = await db.transaction(async (query) => {
      if ('history_task_id' in body) {
        const [exist] = await query
          .select({
            args: schema.tasks.args,
            task_key: schema.tasks.task_key,
            pending_uuid: schema.tasks.pending_uuid,
          })
          .from(schema.tasks)
          .where(eq(schema.tasks.task_id, body.history_task_id))
          .limit(1);
        if (!exist) {
          return;
        }

        await checkPending(exist, query);

        return {
          task_id: body.history_task_id,
          key: exist.task_key as BeString<keyof T>,
          args: exist.args ? JSON.parse(exist.args) : [],
        };
      } else {
        const { key, sqlInfo, args } = body;
        const task_id = randomUUID();

        const { scripts } = this.opts;
        const { group, task_name, search_key, pending_uuid_make } =
          scripts[key];

        const pending_uuid = pending_uuid_make
          ? pending_uuid_make?.({
              group,
              args,
              task_id,
            })
          : null;

        await checkPending({ task_key: key, pending_uuid }, query);

        await query.insert(schema.tasks).values({
          task_id,
          create_timestamp: new Date(),
          args: args ? JSON.stringify(args) : null,
          trigger_method: sqlInfo.trigger_method,
          execution_user_id: sqlInfo.execution_user_id,
          status: 'to-be-started',
          logs: null,
          start_timestamp: null,
          end_timestamp: null,
          last_update_timestamp: null,
          task_key: key,
          task_name:
            task_name?.({
              group,
              args,
              task_id,
            }) ?? null,
          search_key:
            search_key?.({
              group,
              args,
              task_id,
            }) ?? null,
          pending_uuid,
        });

        return {
          task_id,
          key,
          args,
        };
      }
    });

    if (!data) {
      return;
    }

    const { task_id, key, args } = data;

    const promise = new Promise<{ stats: Stats }>((resolve, reject) => {
      this.tasks.push({
        task_id,
        key,
        resolve,
        reject,
        args,
      });
      this.handle();
    });

    return {
      /** 任务ID */
      task_id,
      /** 任务 promise */
      promise,
    };
  }
  private async handle() {
    while (this.idleWorker > 0 && this.tasks.length) {
      this.idleWorker -= 1;
      const item =
        this.opts.queue === 'FIFO' ? this.tasks.shift() : this.tasks.pop();

      if (item) {
        const { task_id, key, reject, resolve, args } = item;
        try {
          const script = this.opts.scripts[key];
          const result = await (async () => {
            const {
              spawnOptions,
              log,
              timeout,
              nodePrefixArgs,
              nodeSuffixArgs,
            } = script;

            const base: {
              [key in keyof Required<ChildProcessExtraOpts>]: ChildProcessExtraOpts[key];
            } = {
              spawnOptions: {
                ...spawnOptions,
              },
              log,
              timeout,
              nodePrefixArgs,
              nodeSuffixArgs,
              logger: undefined,
            };

            if (script.role === 'node') {
              const { dir, filename } = script;
              return await spawnNodeAsync({
                dir,
                filename,
                args: handleArgs(args),
                opts: {
                  'max-old-space-size': 2 ** 10 * 16,
                },
                ...base,
              });
            }
            return await spawnAsync({
              cmd: script.cmd,
              args: handleArgs(args),
              ...base,
            });
          })();

          this.pendingTask[task_id] = result;
          /** 更新任务状态 */
          await this.sqlUpdate({
            task_id,
            updateForm: {
              start_timestamp: new Date(),
              status: 'pending',
            },
          });

          const { stats, promise } = result;

          await promise;

          /** 写入日志 */
          await this.sqlUpdate({
            task_id,
            updateForm: {
              end_timestamp: new Date(),
              logs: await jsonArrayJsonToGzbuffer({
                data: [stats.command, ...stats.logs],
              }),
            },
          });
          /** 不和主动停止任务冲突 */
          await this.sqlUpdate({
            task_id,
            updateForm: {
              status: stats.status === 'success' ? 'completed' : 'failed',
            },
            whereHelper: {
              status: 'pending',
            },
          });

          resolve({ stats });
        } catch (error) {
          reject(error);
        } finally {
          this.idleWorker += 1;
          delete this.pendingTask[task_id];
          this.handle();
        }
      }
    }
  }
  /** 获取所有任务类型 */
  types() {
    const { scripts } = this.opts;
    return getKeys(scripts).map((key) => {
      const { group, argsMode, allowFrontendSubmit } = scripts[key];
      return {
        key,
        name: group,
        argsMode,
        allowFrontendSubmit,
      };
    });
  }
  /** 返回任务队列情况 */
  stats() {
    const { idleWorker, tasks, pendingTask } = this;
    return {
      /** 空闲的 worker 数量 */
      idleWorker,
      /** 剩余任务数量 */
      tasksCount: tasks.length,
      /** 执行中的任务数量 */
      pendingTaskCount: Object.keys(pendingTask).length,
    };
  }
  /** 数据库操作: 更新 */
  private async sqlUpdate({
    task_id,
    updateForm,
    whereHelper,
  }: {
    task_id: string | string[];
    /** 更新内容 */
    updateForm: Partial<TaskSqlInsertItem>;
    /** 过滤条件 */
    whereHelper?: {
      [key in Exclude<keyof TaskSqlInsertItem, 'task_id'>]?:
        | TaskSqlInsertItem[key]
        | TaskSqlInsertItem[key][];
    };
  }) {
    const list = (Array.isArray(task_id) ? task_id : [task_id]).filter(Boolean);
    if (!list.length) {
      return;
    }

    const conditions = [
      inArray(schema.tasks.task_id, list),
      ...Object.entries(whereHelper ?? {}).map(([key, value]) =>
        listFilter(
          schema.tasks[key as keyof typeof schema.tasks] as never,
          value as never,
        ),
      ),
    ];

    await db
      .update(schema.tasks)
      .set({
        ...updateForm,
        last_update_timestamp: new Date(),
      })
      .where(whereAll(...conditions));
  }
  /** 主动杀死进程(by task_id) 或者 标记为删除
   *
   * 运行中的可以kill, 没有运行的可以标记为删除
   */
  async kill(task_id: string | string[]) {
    const list = (Array.isArray(task_id) ? task_id : [task_id]).filter(Boolean);
    if (!list.length) {
      return;
    }
    const pending: string[] = [];
    const others: string[] = [];

    list.forEach((id) => {
      const item = this.pendingTask[id];
      if (item) {
        delete this.pendingTask[id];
        item.kill();
        pending.push(id);
      } else {
        others.push(id);
      }
    });

    await Promise.all([
      this.sqlUpdate({
        task_id: pending,
        updateForm: {
          status: 'killed',
        },
        whereHelper: {
          status: 'pending',
        },
      }),
      this.sqlUpdate({
        task_id: others,
        updateForm: {
          status: 'deleted',
        },
        whereHelper: {
          // in-progress 可以是历史的任务
          status: ['to-be-started', 'pending'],
        },
      }),
    ]);
  }
  /** 数据库操作: 状态计数 */
  async sqlCounts(form: SqlFilter = {}) {
    const data = await db
      .select({
        status: schema.tasks.status,
        count: count(),
      })
      .from(schema.tasks)
      .where(getSqlFilter(form))
      .groupBy(schema.tasks.status);
    return data.map(({ status, count }) => ({
      count,
      status,
    }));
  }
  /** 数据库操作: 日志 */
  async sqlLogsById(task_id: string) {
    /** 任务结束才会写入日志到数据库，如果任务是pending状态，尝试直接读取 */
    if (this.pendingTask[task_id]) {
      return this.pendingTask[task_id].stats.logs;
    }
    const [item] = await db
      .select({ logs: schema.tasks.logs })
      .from(schema.tasks)
      .where(eq(schema.tasks.task_id, task_id))
      .limit(1);
    return item?.logs
      ? await jsonArrayGzbufferToJson<string>({
          buffer: item.logs,
        })
      : null;
  }
  /** 数据库操作: 查询列表 */
  async sqlList({
    limit = [0, 10],
    withCount = false,
    form = {},
  }: {
    limit?: number[];
    withCount?: boolean;
    form?: SqlFilter;
  }) {
    const where = getSqlFilter(form);

    const getCount = async () => {
      if (withCount) {
        return countRows(schema.tasks, where);
      }
      return 0;
    };

    const [list, count] = await Promise.all([
      db
        .select({
          task_id: schema.tasks.task_id,
          create_timestamp: schema.tasks.create_timestamp,
          end_timestamp: schema.tasks.end_timestamp,
          execution_user_id: schema.tasks.execution_user_id,
          trigger_method: schema.tasks.trigger_method,
          start_timestamp: schema.tasks.start_timestamp,
          status: schema.tasks.status,
          task_key: schema.tasks.task_key,
          task_name: schema.tasks.task_name,
          search_key: schema.tasks.search_key,
          pending_uuid: schema.tasks.pending_uuid,
          last_update_timestamp: schema.tasks.last_update_timestamp,
        })
        .from(schema.tasks)
        .where(where)
        .orderBy(desc(schema.tasks.create_timestamp))
        .offset(limit[0])
        .limit(limit[1] - limit[0]),
      getCount(),
    ]);

    const pendingTask = this.pendingTask;

    return {
      list: list.map((self) => ({
        ...self,
        running: Boolean(pendingTask[self.task_id]),
      })),
      count,
    };
  }
}
