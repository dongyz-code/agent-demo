import type { db } from '@/database/index.js';
import type {
  TaskAttemptItem,
  TaskItem,
  TaskLogLevel,
  TaskSqlFilter,
  TaskStatus,
} from '@repo/types';

/** 任务创建和取消可复用的数据库事务类型。 */
export type TaskTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/** 任务自动重试策略。 */
export interface TaskRetryPolicy {
  /** 首次执行之外允许的重试次数。 */
  times: number;
  /** 固定重试间隔，单位毫秒。 */
  delayMs: number;
}

/** 任务定义更新进度时使用的结构化输入。 */
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

/** 任务定义可用的分级持久日志接口。 */
export interface TaskLogger {
  /** 写入普通运行日志。 */
  info: (message: string) => Promise<void>;
  /** 写入调试日志。 */
  debug: (message: string) => Promise<void>;
  /** 写入错误日志。 */
  error: (message: string) => Promise<void>;
}

/** 任务执行函数接收的通用运行上下文。 */
export interface TaskRunContext {
  /** 通用任务标识。 */
  taskId: string;
  /** 当前从 1 开始的执行尝试序号。 */
  attempt: number;
  /** 上次执行保存、自动重试时继续提供的轻量恢复信息。 */
  checkpoint: unknown;
  /** 覆盖保存可 JSON 序列化的轻量恢复信息。 */
  saveCheckpoint: (value: unknown) => Promise<void>;
  /** 分级持久日志。 */
  log: TaskLogger;
  /** 更新当前阶段、进度和数量摘要。 */
  progress: (input: TaskProgressInput) => Promise<void>;
  /** 检查任务仍持有 lease，已取消或失效时抛出 TaskCanceledError。 */
  throwIfCanceled: () => Promise<void>;
}

/** 任务脚本默认导出函数接收的持久化数据与运行上下文。 */
export type TaskHandler<TData = unknown, TResult = unknown> = (
  data: TData,
  context: TaskRunContext,
) => Promise<TResult> | TResult;

/** `defineTask` 声明脚本入口和执行策略时使用的配置。 */
export interface TaskOptions {
  /**
   * 任务脚本 URL 或相对于 `hooks` 目录的路径。
   *
   * 任务脚本通常传入 `import.meta.url`，框架会自动去除构建扩展名。
   */
  readonly script: string | URL;
  /** 跨脚本共享的并发分组，默认使用 default。 */
  readonly group?: string;
  /** 当前分组跨服务实例的并发上限，默认 1。 */
  readonly concurrency?: number;
  /** 自动重试策略；未配置时不自动重试。 */
  readonly retry?: TaskRetryPolicy;
  /** 单次执行超时，默认 10 分钟。 */
  readonly timeoutMs?: number;
}

/** 任务创建时由业务调用方提供的审计信息。 */
export interface TaskEnqueueOptions {
  /** 发起任务创建的用户；系统任务允许为空。 */
  actorUserId: string | null;
  /** 任务中心展示名称；为空时使用脚本文件名。 */
  title?: string;
  /** 业务方用于关联领域对象的稳定标识。 */
  correlationId?: string;
  /** 需要和领域写入共享事务时由调用方预先生成的任务标识。 */
  taskId?: string;
  /** 与任务主记录、入队日志和领域扩展共享的事务。 */
  transaction?: TaskTransaction;
}

/** 类型化任务句柄查询返回的通用任务详情。 */
export type TaskDetail<TData, TResult> = Omit<TaskItem, 'result'> & {
  /** 调用方入队时保存的执行数据。 */
  data: TData;
  /** 任务成功返回的可序列化结果。 */
  result: TResult | null;
  /** 按执行序号排列的全部 attempt。 */
  attempts: TaskAttemptItem[];
};

/** 业务模块持有并用于创建任务的最小类型化句柄。 */
export interface TaskHandle<TData> {
  /**
   * 使用脚本定义中的策略创建任务。
   *
   * @param data 会持久化并传给脚本默认导出函数的数据。
   * @param options 展示名称、关联标识、审计用户和可选共享事务。
   * @returns 通用任务标识。
   */
  enqueue: (data: TData, options: TaskEnqueueOptions) => Promise<string>;
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
  /** 与领域状态收敛共享的事务。 */
  transaction?: TaskTransaction;
}

/** 入队事务提交前保存的任务策略快照。 */
export interface TaskPolicySnapshot {
  /** 相对于服务端 `hooks` 目录的任务脚本入口。 */
  scriptPath: string;
  /** 共享并发分组。 */
  groupName: string;
  /** 面向任务中心展示的业务名称。 */
  displayName: string;
  /** 当前分组跨服务实例并发上限。 */
  concurrency: number;
  /** 首次执行之外允许的重试次数。 */
  maxRetries: number;
  /** 固定重试间隔，单位毫秒。 */
  retryDelayMs: number;
  /** 单次执行超时，单位毫秒。 */
  timeoutMs: number;
}

/** Dispatcher 传给 Worker 子进程的最小执行参数。 */
export interface TaskWorkerInput {
  /** 通用任务标识。 */
  taskId: string;
  /** Worker 加载并执行的任务脚本入口。 */
  scriptPath: string;
  /** 当前 attempt 标识。 */
  attemptId: string;
  /** 当前 attempt 序号。 */
  attempt: number;
  /** 当前领取生成的 lease。 */
  leaseId: string;
  /** 调用方保存并传给脚本的执行数据。 */
  data: unknown;
  /** 上次执行保存的轻量恢复信息。 */
  checkpoint: unknown;
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
  /** 当前任务持久化的脚本入口。 */
  scriptPath: string;
  /** 共享并发分组。 */
  groupName: string;
  /** 当前 attempt 标识。 */
  attemptId: string;
  /** 当前 attempt 序号。 */
  attempt: number;
  /** 当前领取生成的 lease。 */
  leaseId: string;
  /** 调用方保存并传给脚本的执行数据。 */
  data: unknown;
  /** 上次执行保存的轻量恢复信息。 */
  checkpoint: unknown;
  /** 单次执行超时，单位毫秒。 */
  timeoutMs: number;
  /** 当前分组跨服务实例并发上限。 */
  concurrency: number;
}

/** 可被当前轮调度尝试领取的任务摘要。 */
export interface RunnableTaskCandidate {
  /** 通用任务标识。 */
  taskId: string;
  /** 共享并发分组。 */
  groupName: string;
  /** 当前分组跨服务实例并发上限。 */
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
  /** 任务定义成功返回的可序列化结果。 */
  result?: unknown;
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

/** 任务取消或 lease 失效时由运行上下文抛出的稳定异常。 */
export class TaskCanceledError extends Error {
  /** 创建不包含业务数据的取消异常。 */
  constructor() {
    super('TASK_CANCELED: 任务已取消或执行租约失效');
    this.name = 'TaskCanceledError';
  }
}

/** Worker 子进程允许访问的最小任务持久化能力。 */
export interface TaskWorkerRuntimeStore {
  /** 判断当前任务是否仍持有有效 lease。 */
  assertTaskLeaseActive: (taskId: string, leaseId: string) => Promise<boolean>;
  /** 在 lease 仍有效时追加任务定义日志。 */
  appendTaskRuntimeLog: (input: {
    /** 通用任务标识。 */
    taskId: string;
    /** 当前领取生成的 lease。 */
    leaseId: string;
    /** 当前 attempt 序号。 */
    attempt: number;
    /** 日志级别。 */
    level: TaskLogLevel;
    /** 已脱敏日志消息。 */
    message: string;
  }) => Promise<boolean>;
  /** 在 lease 仍有效时更新任务定义进度。 */
  updateTaskRuntimeProgress: (
    input: {
      /** 通用任务标识。 */
      taskId: string;
      /** 当前领取生成的 lease。 */
      leaseId: string;
    } & TaskProgressInput,
  ) => Promise<boolean>;
  /** 在 lease 仍有效时覆盖任务 checkpoint。 */
  saveTaskRuntimeCheckpoint: (
    taskId: string,
    leaseId: string,
    checkpoint: unknown,
  ) => Promise<boolean>;
}
