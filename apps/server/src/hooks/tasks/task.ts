import { logger } from '@/configs/index.js';
import { TaskDatabase, taskDatabase } from './database.js';
import { TaskDispatcher, taskDispatcher } from './dispatcher.js';

import type {
  TaskAddInput,
  TaskCancelOptions,
  TaskListOptions,
  TaskLogOptions,
  TaskScriptModule,
} from './types.js';

/** 未显式配置时允许的单实例同名任务并发数。 */
const DEFAULT_TASK_CONCURRENCY = 4;
/** 未显式配置时使用的固定重试间隔。 */
const DEFAULT_TASK_RETRY_DELAY_MS = 5_000;
/** 未显式配置时允许的单次执行时间。 */
const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000;

/** 业务模块唯一允许使用的通用任务 API。 */
export class TaskApi {
  /**
   * 创建业务模块使用的任务入口。
   *
   * @param database 任务持久化与状态迁移入口。
   * @param dispatcher 服务实例任务调度入口。
   */
  constructor(
    private readonly database: TaskDatabase = taskDatabase,
    private readonly dispatcher: TaskDispatcher = taskDispatcher,
  ) {}

  /**
   * 添加持久化后台任务并立即返回任务 ID。
   *
   * @param input 名称、脚本、数据和可选执行策略组成的完整对象。
   * @returns 新建任务标识。
   */
  async add<TData>(input: TaskAddInput<TData>): Promise<string> {
    const name = input.name.trim();
    if (!name) throw new Error('TASK_NAME_REQUIRED: 任务名称不能为空');
    if (name.length > 255) {
      throw new Error('TASK_NAME_INVALID: 任务名称不能超过 255 个字符');
    }
    if (input.data === undefined) {
      throw new Error('TASK_DATA_INVALID: 任务数据不能是 undefined');
    }
    const serialized = JSON.stringify(input.data);
    if (serialized === undefined) {
      throw new Error('TASK_DATA_INVALID: 任务数据无法序列化');
    }
    const data = JSON.parse(serialized) as TData;
    const concurrency = input.concurrency ?? DEFAULT_TASK_CONCURRENCY;
    const maxRetries = input.retry?.times ?? 0;
    const retryDelayMs = input.retry?.delay ?? DEFAULT_TASK_RETRY_DELAY_MS;
    const timeoutMs = input.timeout ?? DEFAULT_TASK_TIMEOUT_MS;
    if (!Number.isInteger(concurrency) || concurrency <= 0) {
      throw new Error('TASK_POLICY_INVALID: concurrency 必须是大于零的整数');
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error('TASK_POLICY_INVALID: retry.times 必须是非负整数');
    }
    if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
      throw new Error('TASK_POLICY_INVALID: retry.delay 必须是非负整数');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new Error('TASK_POLICY_INVALID: timeout 必须是大于零的整数');
    }
    const script = (await import(input.script)) as TaskScriptModule<TData>;
    const taskId = await this.database.addTask(
      {
        name,
        script: input.script,
        data,
        concurrency,
        maxRetries,
        retryDelayMs,
        timeoutMs,
      },
      script.onCreate,
    );
    this.dispatcher.notify();
    return taskId;
  }

  /**
   * 查询任务摘要和全部 attempt。
   *
   * @param taskId 通用任务标识。
   * @returns 任务不存在时返回 null。
   */
  get(taskId: string) {
    return this.database.getTask(taskId);
  }

  /**
   * 分页查询通用任务。
   *
   * @param options 过滤、分页和计数开关。
   * @returns 当前页与可选总数。
   */
  list(options: TaskListOptions = {}) {
    return this.database.listTasks(options);
  }

  /**
   * 查询完整结构化任务日志。
   *
   * @param taskId 通用任务标识。
   * @param options 可选 attempt 过滤。
   * @returns 按时间和日志标识排序的日志。
   */
  logs(taskId: string, options: TaskLogOptions = {}) {
    return this.database.readTaskLogs(taskId, options);
  }

  /**
   * 取消等待、重试中或运行中的任务。
   *
   * @param taskId 通用任务标识。
   * @param options 取消用户、稳定错误码和安全原因。
   * @returns 实际从活动状态取消时返回 true。
   */
  async cancel(
    taskId: string,
    options: TaskCancelOptions = {},
  ): Promise<boolean> {
    const scriptUrl = await this.database.getTaskScript(taskId);
    let onCancel: TaskScriptModule['onCancel'];
    if (scriptUrl) {
      try {
        const script = (await import(scriptUrl)) as TaskScriptModule;
        onCancel = script.onCancel;
      } catch (error) {
        logger.warn(
          { event: 'task.cancel_script_load_failed', taskId, err: error },
          '任务脚本无法加载，将只取消通用任务状态',
        );
      }
    }
    const canceled = await this.database.cancelTask(taskId, options, onCancel);
    if (!canceled) return false;
    this.dispatcher.interrupt(taskId);
    return true;
  }

  /**
   * 启动 stale 恢复和统一 Dispatcher。
   *
   * @returns Dispatcher 完成启动后结束。
   */
  async start(): Promise<void> {
    await this.dispatcher.start();
  }

  /**
   * 按过滤条件统计各任务状态数量。
   *
   * @param filter 与 list 共用的过滤条件。
   * @returns 状态及对应数量。
   */
  counts(filter: TaskListOptions['filter'] = {}) {
    return this.database.countTasksByStatus(filter);
  }
}

/** 通用任务模块唯一公共实例。 */
export const task = new TaskApi();

export type {
  TaskAddInput,
  TaskCancelLifecycleInput,
  TaskCancelOptions,
  TaskCreateInput,
  TaskFailureInput,
  TaskListOptions,
  TaskListResult,
  TaskLogOptions,
  TaskLogger,
  TaskProgressInput,
  TaskRetryInput,
  TaskRunInput,
  TaskScript,
  TaskScriptModule,
  TaskScriptTransaction,
} from './types.js';

export { TaskCanceledError } from './types.js';
