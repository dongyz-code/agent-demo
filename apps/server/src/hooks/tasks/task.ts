import { uuidv7 } from '@/utils/index.js';

import { TaskDatabase, taskDatabase } from './database.js';
import { TaskDispatcher, taskDispatcher } from './dispatcher.js';
import { normalizeTaskScript } from './script-loader.js';

import type {
  TaskCancelOptions,
  TaskDetail,
  TaskEnqueueOptions,
  TaskHandle,
  TaskListOptions,
  TaskLogOptions,
  TaskOptions,
  TaskPolicySnapshot,
  TaskTransaction,
} from './types.js';

/** 未显式配置并发分组时使用的稳定分组。 */
const DEFAULT_TASK_GROUP = 'default';
/** 未显式配置分组并发时使用单任务串行。 */
const DEFAULT_TASK_CONCURRENCY = 1;
/** 未显式配置单次执行超时时使用十分钟。 */
const DEFAULT_TASK_TIMEOUT_MS = 10 * 60_000;
/** 未显式配置重试间隔时使用固定五秒。 */
const DEFAULT_TASK_RETRY_DELAY_MS = 5_000;

/** 已完成默认值和脚本路径归一化的任务策略。 */
type NormalizedTaskPolicy = Omit<TaskPolicySnapshot, 'displayName'>;

/**
 * 声明任务脚本入口和执行策略，并返回调用方可用的类型化入队句柄。
 *
 * 任务脚本本身默认导出 `(data, context) => Promise<Result>`；本函数不接收
 * 执行函数、prepare 或生命周期回调。
 *
 * @param options 脚本入口、并发分组、重试和超时策略。
 * @returns 只暴露类型化 `enqueue` 的任务句柄。
 */
export function defineTask<TData>(options: TaskOptions): TaskHandle<TData> {
  const policy = normalizeTaskPolicy(options);
  return {
    enqueue: async (data, enqueueOptions) =>
      await task.enqueue(policy, data, enqueueOptions),
  };
}

/**
 * 任务中心的通用入队、查询、取消和运行时管理入口。
 */
export class TaskApi {
  /**
   * 创建任务中心运行时入口。
   *
   * @param database 任务持久化与状态迁移入口。
   * @param dispatcher 当前服务实例的调度器。
   */
  constructor(
    private readonly database: TaskDatabase = taskDatabase,
    private readonly dispatcher: TaskDispatcher = taskDispatcher,
  ) {}

  /**
   * 生成任务标识，供需要和领域写入共享事务的调用方预先使用。
   *
   * @returns UUIDv7 任务标识。
   */
  createId(): string {
    return uuidv7();
  }

  /**
   * 使用静态策略和调用方数据创建任务。
   *
   * @param policy 已完成校验的任务策略。
   * @param data 会 JSON 序列化并传给脚本的数据。
   * @param options 展示名称、关联标识、审计用户和可选共享事务。
   * @returns 新建任务标识。
   */
  async enqueue<TData>(
    policy: NormalizedTaskPolicy,
    data: TData,
    options: TaskEnqueueOptions,
  ): Promise<string> {
    const displayName =
      options.title?.trim() ||
      policy.scriptPath.split('/').at(-1) ||
      '后台任务';
    if (!displayName) {
      throw new Error('TASK_DISPLAY_NAME_REQUIRED: 任务展示名称不能为空');
    }
    if (displayName.length > 255) {
      throw new Error(
        'TASK_DISPLAY_NAME_INVALID: 任务展示名称不能超过 255 个字符',
      );
    }
    const correlationId = options.correlationId?.trim() || null;
    if (correlationId && correlationId.length > 255) {
      throw new Error(
        'TASK_CORRELATION_ID_INVALID: 任务关联标识不能超过 255 个字符',
      );
    }
    const taskId = await this.database.addTask(
      { ...policy, displayName },
      data,
      {
        taskId: options.taskId,
        correlationId,
        transaction: options.transaction,
      },
    );
    if (!options.transaction) this.dispatcher.notify();
    return taskId;
  }

  /**
   * 查询任务详情和全部执行记录。
   *
   * @param taskId 通用任务标识。
   * @returns 任务不存在时返回 null。
   */
  async get<TData = unknown, TResult = unknown>(
    taskId: string,
  ): Promise<TaskDetail<TData, TResult> | null> {
    return await this.database.getTask<TData, TResult>(taskId);
  }

  /**
   * 批量读取任务输入与状态，供领域去重和活动任务协调使用。
   *
   * @typeParam TData 对应任务脚本的持久化输入类型。
   * @param taskIds 已由业务关联范围筛选的任务标识。
   * @param transaction 可选调用方事务。
   * @returns 与标识顺序一致的任务快照，不额外读取 attempt 历史。
   */
  getMany<TData = unknown>(taskIds: string[], transaction?: TaskTransaction) {
    return this.database.getTasks<TData>(taskIds, transaction);
  }

  /**
   * 分页查询通用任务。
   *
   * @param options 过滤、分页和计数开关。
   * @returns 当前页任务和可选总数。
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
   * 取消 queued、retrying 或 running 任务。
   *
   * @param taskId 通用任务标识。
   * @param options 取消审计、安全原因和可选共享事务。
   * @returns 实际从活动状态取消时返回 true。
   */
  async cancel(
    taskId: string,
    options: TaskCancelOptions = {},
  ): Promise<boolean> {
    const canceled = await this.database.cancelTask(taskId, options);
    if (!canceled || options.transaction) return canceled;
    this.dispatcher.interrupt(taskId);
    return true;
  }

  /**
   * 终止当前实例正在监督的任务子进程。
   *
   * @param taskId 已持久化为 canceled 的通用任务标识。
   * @returns 当前实例持有该任务时返回 true。
   */
  interrupt(taskId: string): boolean {
    return this.dispatcher.interrupt(taskId);
  }

  /**
   * 启动任务事件订阅和统一 Dispatcher。
   *
   * @returns Dispatcher 完成启动后结束。
   */
  async start(): Promise<void> {
    await this.dispatcher.start();
  }

  /** 停止事件订阅和本实例子进程，禁止退出期间继续领取任务。 */
  stop(): void {
    this.dispatcher.stop();
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

/**
 * 校验任务配置并补齐默认策略。
 *
 * @param options 任务脚本声明的原始配置。
 * @returns 可持久化的完整策略。
 */
function normalizeTaskPolicy(options: TaskOptions): NormalizedTaskPolicy {
  const scriptPath = normalizeTaskScript(options.script);
  const groupName = (options.group ?? DEFAULT_TASK_GROUP).trim();
  const concurrency = options.concurrency ?? DEFAULT_TASK_CONCURRENCY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
  const maxRetries = options.retry?.times ?? 0;
  const retryDelayMs = options.retry?.delayMs ?? DEFAULT_TASK_RETRY_DELAY_MS;
  if (!groupName) {
    throw new Error('TASK_GROUP_REQUIRED: 任务并发分组不能为空');
  }
  if (groupName.length > 255) {
    throw new Error('TASK_GROUP_INVALID: 任务并发分组不能超过 255 个字符');
  }
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error('TASK_POLICY_INVALID: concurrency 必须是大于零的整数');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('TASK_POLICY_INVALID: timeoutMs 必须是大于零的整数');
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error('TASK_POLICY_INVALID: retry.times 必须是非负整数');
  }
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0) {
    throw new Error('TASK_POLICY_INVALID: retry.delayMs 必须是非负整数');
  }
  return {
    scriptPath,
    groupName,
    concurrency,
    maxRetries,
    retryDelayMs,
    timeoutMs,
  };
}

/** 通用任务模块唯一公共运行时实例。 */
export const task = new TaskApi();

export type {
  TaskCancelOptions,
  TaskDetail,
  TaskEnqueueOptions,
  TaskHandle,
  TaskHandler,
  TaskListOptions,
  TaskListResult,
  TaskLogOptions,
  TaskLogger,
  TaskOptions,
  TaskPolicySnapshot,
  TaskProgressInput,
  TaskRetryPolicy,
  TaskRunContext,
  TaskTransaction,
  TaskWorkerRuntimeStore,
} from './types.js';

export { TaskCanceledError } from './types.js';
