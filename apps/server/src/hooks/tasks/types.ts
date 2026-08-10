import type { db } from '@/database/index.js';
import type { TaskItem, TaskSqlFilter, TaskStatus } from '@repo/types';

/** 脚本生命周期由 task 包注入的内部事务类型，调用 task.add 时不允许传入。 */
export type TaskScriptTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/** 任务自动重试配置。 */
export interface TaskRetryInput {
  /** 首次执行之外允许的重试次数。 */
  times: number;
  /** 固定重试间隔，单位毫秒。 */
  delay: number;
}

/** 业务代码添加后台任务时传入的唯一参数对象。 */
export interface TaskAddInput<TData = unknown> {
  /** 稳定任务名称，同时用于同名任务并发分组。 */
  name: string;
  /** 子进程动态导入的服务端脚本模块 URL。 */
  script: string;
  /** 可被 PostgreSQL JSONB 保存的业务数据。 */
  data: TData;
  /** 可选自动重试配置，未提供时不自动重试。 */
  retry?: TaskRetryInput;
  /** 可选单次执行超时，单位毫秒。 */
  timeout?: number;
  /** 可选单实例同名任务并发上限。 */
  concurrency?: number;
}

/** task.add 校验并补齐默认值后的持久化快照。 */
export interface TaskSnapshot<TData = unknown> {
  /** 已去除首尾空白的稳定任务名称。 */
  name: string;
  /** 服务端业务代码提供的内部模块 URL。 */
  script: string;
  /** JSON 序列化往返后的业务数据。 */
  data: TData;
  /** 单实例同名任务并发上限。 */
  concurrency: number;
  /** 首次执行之外允许的重试次数。 */
  maxRetries: number;
  /** 固定重试间隔，单位毫秒。 */
  retryDelayMs: number;
  /** 单次执行超时，单位毫秒。 */
  timeoutMs: number;
}

/** 任务脚本更新进度时使用的结构化输入。 */
export interface TaskProgressInput {
  /** 整数进度，范围为 0 到 100。 */
  progress: number;
  /** 当前业务阶段。 */
  stage?: string | null;
  /** 已处理项目数量。 */
  processedItems?: number;
  /** 待处理项目总数。 */
  totalItems?: number;
}

/** 任务脚本可用的分级持久日志接口。 */
export interface TaskLogger {
  /** 写入普通运行日志。 */
  info: (message: string) => Promise<void>;
  /** 写入调试日志。 */
  debug: (message: string) => Promise<void>;
  /** 写入错误日志。 */
  error: (message: string) => Promise<void>;
}

/** 脚本默认导出函数接收的唯一运行参数对象。 */
export interface TaskRunInput<TData = unknown> {
  /** 通用任务标识。 */
  taskId: string;
  /** 当前从 1 开始的执行尝试序号。 */
  attempt: number;
  /** 入队时保存的业务数据。 */
  data: TData;
  /** 分级持久日志。 */
  log: TaskLogger;
  /** 更新当前阶段、进度和数量摘要。 */
  progress: (input: TaskProgressInput) => Promise<void>;
  /** 检查任务仍持有 lease，已取消或失效时抛出 TaskCanceledError。 */
  throwIfCanceled: () => Promise<void>;
}

/** task 包创建任务时传给脚本可选 onCreate 的参数。 */
export interface TaskCreateInput<TData = unknown> {
  /** 即将持久化的通用任务标识。 */
  taskId: string;
  /** 入队时保存的业务数据。 */
  data: TData;
  /** task 包内部创建任务记录所使用的事务。 */
  transaction: TaskScriptTransaction;
}

/** task 包取消任务时传给脚本可选 onCancel 的参数。 */
export interface TaskCancelLifecycleInput<
  TData = unknown,
> extends TaskCreateInput<TData> {
  /** 发起取消的用户，系统取消允许为空。 */
  userId: string | null;
  /** 稳定取消错误码。 */
  errorCode: string;
  /** 面向任务中心的安全取消原因。 */
  errorMessage: string;
}

/** task 包最终失败时传给脚本可选 onTerminalFailure 的参数。 */
export interface TaskFailureInput<
  TData = unknown,
> extends TaskCreateInput<TData> {
  /** 最终状态使用的稳定错误码。 */
  errorCode: string;
  /** 面向任务中心的安全错误摘要。 */
  errorMessage: string;
  /** 最终 attempt 是普通失败、超时还是异常中断。 */
  reason: 'failed' | 'timed_out' | 'interrupted';
}

/** 任务脚本默认导出函数；正常返回表示成功，抛出异常表示失败。 */
export type TaskScript<TData = unknown, TResult = unknown> = (
  input: TaskRunInput<TData>,
) => Promise<TResult>;

/** 动态导入后的任务脚本模块约定。 */
export interface TaskScriptModule<TData = unknown> {
  /** 子进程执行的默认导出函数。 */
  default: TaskScript<TData>;
  /** 可选任务创建生命周期，由 task.add 的内部事务调用。 */
  onCreate?: (input: TaskCreateInput<TData>) => Promise<void>;
  /** 可选任务取消生命周期，由 task.cancel 的内部事务调用。 */
  onCancel?: (input: TaskCancelLifecycleInput<TData>) => Promise<void>;
  /** 可选最终失败生命周期，由状态收敛事务调用。 */
  onTerminalFailure?: (input: TaskFailureInput<TData>) => Promise<void>;
}

/** 通用任务分页查询输入。 */
export interface TaskListOptions {
  /** 任务过滤条件。 */
  filter?: TaskSqlFilter;
  /** `[offset, end)` 分页区间。 */
  limit?: number[];
  /** 是否同时统计过滤总数。 */
  withCount?: boolean;
}

/** 通用任务分页查询结果。 */
export interface TaskListResult {
  /** 当前页任务。 */
  list: TaskItem[];
  /** withCount 关闭时为 0。 */
  count: number;
}

/** 结构化日志查询输入。 */
export interface TaskLogOptions {
  /** 只返回指定 attempt；未提供时返回全部。 */
  attempt?: number;
}

/** 主动取消任务时允许覆盖的审计和安全错误信息。 */
export interface TaskCancelOptions {
  /** 发起取消的用户，系统取消允许为空。 */
  userId?: string | null;
  /** 稳定取消错误码。 */
  errorCode?: string;
  /** 面向任务中心的安全取消原因。 */
  message?: string;
}

/** Dispatcher 传给 Worker 子进程的最小执行参数。 */
export interface TaskWorkerInput {
  /** 通用任务标识。 */
  taskId: string;
  /** 子进程需要动态导入的脚本 URL。 */
  script: string;
  /** 当前 attempt 标识。 */
  attemptId: string;
  /** 当前 attempt 序号。 */
  attempt: number;
  /** 当前领取生成的 lease。 */
  leaseId: string;
  /** 入队时保存的业务数据。 */
  data: unknown;
}

/** Worker 子进程通过 IPC 返回的安全执行结果。 */
export type TaskWorkerResult =
  | { type: 'result'; success: true; result: unknown }
  | {
      type: 'result';
      success: false;
      errorCode: string;
      errorMessage: string;
    };

/** Dispatcher 收敛单次执行时支持的结果。 */
export type TaskAttemptOutcome =
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'interrupted';

/** 领取成功后 Dispatcher 监督 Worker 子进程所需的完整快照。 */
export interface ClaimedTask {
  /** 通用任务标识。 */
  taskId: string;
  /** 稳定任务名称。 */
  name: string;
  /** 子进程动态导入的脚本模块 URL。 */
  script: string;
  /** 当前 attempt 标识。 */
  attemptId: string;
  /** 当前 attempt 序号。 */
  attempt: number;
  /** 当前领取生成的 lease。 */
  leaseId: string;
  /** 任务业务数据。 */
  data: unknown;
  /** 单次执行超时，单位毫秒。 */
  timeoutMs: number;
  /** 单实例同名任务并发上限。 */
  concurrency: number;
}

/** 可被当前轮调度尝试领取的任务摘要。 */
export interface RunnableTaskCandidate {
  /** 通用任务标识。 */
  taskId: string;
  /** 稳定任务名称。 */
  name: string;
  /** 单实例同名任务并发上限。 */
  concurrency: number;
}

/** 单次执行状态收敛输入。 */
export interface SettleTaskAttemptInput {
  /** 通用任务标识。 */
  taskId: string;
  /** 当前 attempt 标识。 */
  attemptId: string;
  /** 当前领取生成的 lease。 */
  leaseId: string;
  /** 本次执行结果。 */
  outcome: TaskAttemptOutcome;
  /** 稳定错误码，成功时不提供。 */
  errorCode?: string;
  /** 安全错误摘要，成功时不提供。 */
  errorMessage?: string;
  /** 任务脚本成功返回的可序列化结果。 */
  result?: unknown;
  /** 脚本可选最终失败生命周期函数。 */
  onTerminalFailure?: TaskScriptModule['onTerminalFailure'];
}

/** 单次执行状态收敛结果。 */
export interface SettleTaskAttemptResult {
  /** 是否仍持有任务并完成状态迁移。 */
  settled: boolean;
  /** 是否已经安排下一次自动重试。 */
  retryScheduled: boolean;
  /** 没有重试时的任务终态。 */
  terminalStatus?: Extract<TaskStatus, 'succeeded' | 'failed' | 'timed_out'>;
}

/** 任务取消或 lease 失效时由运行参数抛出的稳定异常。 */
export class TaskCanceledError extends Error {
  /** 创建不包含业务数据的取消异常。 */
  constructor() {
    super('TASK_CANCELED: 任务已取消或执行租约失效');
    this.name = 'TaskCanceledError';
  }
}
