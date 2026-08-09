import {
  and,
  asc,
  count as countSql,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import { db, schemas } from '@/database/index.js';
import { uuidv7 } from '@/utils/index.js';
import { decideTaskSettlement } from './runtime.js';

import type {
  TaskAttemptStatus,
  TaskItem,
  TaskLogLevel,
  TaskSqlFilter,
  TaskStatus,
} from '@repo/types';
import type { SQL } from 'drizzle-orm';
import type {
  TaskAttemptOutcome,
  TaskCancelOptions,
  TaskListOptions,
  TaskLogOptions,
  TaskProgressInput,
  TaskScriptModule,
  TaskScriptTransaction,
  TaskSnapshot,
} from './types.js';

/** 支持任务入队与日志写入的数据库执行器。 */
type TaskInsertExecutor = Pick<typeof db, 'insert' | 'select'>;

/** 任务列表和详情对外返回的稳定字段。 */
const TASK_PUBLIC_FIELDS = {
  task_id: schemas.tasks.task_id,
  task_name: schemas.tasks.task_name,
  current_stage: schemas.tasks.current_stage,
  progress: schemas.tasks.progress,
  processed_items: schemas.tasks.processed_items,
  total_items: schemas.tasks.total_items,
  result: schemas.tasks.result,
  attempt_count: schemas.tasks.attempt_count,
  max_retries: schemas.tasks.max_retries,
  retry_delay_ms: schemas.tasks.retry_delay_ms,
  timeout_ms: schemas.tasks.timeout_ms,
  concurrency: schemas.tasks.concurrency,
  next_run_at: schemas.tasks.next_run_at,
  error_code: schemas.tasks.error_code,
  error_message: schemas.tasks.error_message,
  status: schemas.tasks.status,
  create_timestamp: schemas.tasks.create_timestamp,
  start_timestamp: schemas.tasks.start_timestamp,
  end_timestamp: schemas.tasks.end_timestamp,
  last_update_timestamp: schemas.tasks.last_update_timestamp,
} as const;

/** 执行尝试对外返回的稳定字段。 */
const TASK_ATTEMPT_PUBLIC_FIELDS = {
  attempt_id: schemas.task_attempts.attempt_id,
  task_id: schemas.task_attempts.task_id,
  attempt: schemas.task_attempts.attempt,
  status: schemas.task_attempts.status,
  worker_id: schemas.task_attempts.worker_id,
  process_id: schemas.task_attempts.process_id,
  error_code: schemas.task_attempts.error_code,
  error_message: schemas.task_attempts.error_message,
  result: schemas.task_attempts.result,
  start_timestamp: schemas.task_attempts.start_timestamp,
  end_timestamp: schemas.task_attempts.end_timestamp,
} as const;

/** 领取成功后父 Worker 监督子进程所需的完整快照。 */
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
  /** 单次执行超时。 */
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
  terminalStatus?: Extract<
    TaskStatus,
    'succeeded' | 'failed' | 'timed_out'
  >;
}

/**
 * 使用 task 包内部事务创建通用任务与初始日志。
 *
 * @param snapshot 已校验的名称、脚本、数据和策略快照。
 * @param onCreate 脚本可选创建生命周期函数。
 * @returns 新建任务标识。
 */
export async function addTask<TData>(
  snapshot: TaskSnapshot<TData>,
  onCreate?: TaskScriptModule<TData>['onCreate'],
): Promise<string> {
  const taskId = uuidv7();
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction.insert(schemas.tasks).values({
      task_id: taskId,
      task_name: snapshot.name,
      script: snapshot.script,
      data: snapshot.data,
      status: 'queued',
      current_stage: null,
      progress: 0,
      processed_items: 0,
      total_items: 0,
      result: null,
      attempt_count: 0,
      max_retries: snapshot.maxRetries,
      retry_delay_ms: snapshot.retryDelayMs,
      timeout_ms: snapshot.timeoutMs,
      concurrency: snapshot.concurrency,
      next_run_at: null,
      current_attempt_id: null,
      lease_id: null,
      lease_expires_at: null,
      error_code: null,
      error_message: null,
      create_timestamp: now,
      start_timestamp: null,
      end_timestamp: null,
      last_update_timestamp: now,
    });
    await onCreate?.({
      taskId,
      data: snapshot.data,
      transaction,
    });
    await appendTaskLog(
      {
        taskId,
        attempt: 0,
        level: 'info',
        message: `任务已进入队列：${snapshot.name}`,
      },
      transaction,
    );
  });
  return taskId;
}

/**
 * 读取任务脚本 URL，供 task.cancel 在进入状态事务前加载生命周期函数。
 *
 * @param taskId 通用任务标识。
 * @returns 任务不存在时返回 undefined。
 */
export async function getTaskScript(
  taskId: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ script: schemas.tasks.script })
    .from(schemas.tasks)
    .where(eq(schemas.tasks.task_id, taskId))
    .limit(1);
  return row?.script;
}

/**
 * 查询单个通用任务及全部 attempt。
 *
 * @param taskId 通用任务标识。
 * @returns 任务不存在时返回 null。
 */
export async function getTask(taskId: string) {
  const [item] = await db
    .select(TASK_PUBLIC_FIELDS)
    .from(schemas.tasks)
    .where(eq(schemas.tasks.task_id, taskId))
    .limit(1);
  if (!item) return null;
  const attempts = await db
    .select(TASK_ATTEMPT_PUBLIC_FIELDS)
    .from(schemas.task_attempts)
    .where(eq(schemas.task_attempts.task_id, taskId))
    .orderBy(asc(schemas.task_attempts.attempt));
  return { ...item, attempts };
}

/**
 * 分页查询通用任务。
 *
 * @param options 过滤、分页和计数开关。
 * @returns 当前页任务和可选总数。
 */
export async function listTasks(options: TaskListOptions = {}) {
  const where = taskFilterToWhere(options.filter);
  const [offset, size] = normalizePageRange(options.limit);
  const listPromise = db
    .select(TASK_PUBLIC_FIELDS)
    .from(schemas.tasks)
    .where(where)
    .orderBy(desc(schemas.tasks.create_timestamp))
    .offset(offset)
    .limit(size);
  let countPromise: Promise<{ value: number }[]> = Promise.resolve([]);
  if (options.withCount) {
    countPromise = db
      .select({ value: countSql() })
      .from(schemas.tasks)
      .where(where);
  }
  const [list, countRows] = await Promise.all([listPromise, countPromise]);
  return { list, count: countRows[0]?.value ?? 0 };
}

/**
 * 按过滤条件统计任务状态。
 *
 * @param filter 与列表共用的过滤条件。
 * @returns 当前出现的状态及数量。
 */
export async function countTasksByStatus(filter: TaskSqlFilter = {}) {
  const rows = await db
    .select({ status: schemas.tasks.status, count: countSql() })
    .from(schemas.tasks)
    .where(taskFilterToWhere(filter))
    .groupBy(schemas.tasks.status);
  return rows.map((row) => ({ status: row.status, count: row.count }));
}

/**
 * 查询任务完整结构化日志。
 *
 * @param taskId 通用任务标识。
 * @param options 可选 attempt 过滤。
 * @returns 按产生时间和日志标识排序的记录。
 */
export async function readTaskLogs(
  taskId: string,
  options: TaskLogOptions = {},
) {
  const conditions: SQL[] = [eq(schemas.task_logs.task_id, taskId)];
  if (options.attempt !== undefined) {
    conditions.push(eq(schemas.task_logs.attempt, options.attempt));
  }
  return await db
    .select()
    .from(schemas.task_logs)
    .where(and(...conditions))
    .orderBy(
      asc(schemas.task_logs.create_timestamp),
      asc(schemas.task_logs.log_id),
    );
}

/**
 * 追加一条结构化持久日志。
 *
 * @param input 任务、attempt、级别和已脱敏消息。
 * @param executor 可选共享事务。
 * @returns 写入完成后结束。
 */
export async function appendTaskLog(
  input: {
    /** 通用任务标识。 */
    taskId: string;
    /** 产生日志的 attempt。 */
    attempt: number;
    /** 日志级别。 */
    level: TaskLogLevel;
    /** 已脱敏消息。 */
    message: string;
  },
  executor: TaskInsertExecutor = db,
): Promise<void> {
  const message = input.message.trim();
  if (!message) return;
  await executor.insert(schemas.task_logs).values({
    log_id: uuidv7(),
    task_id: input.taskId,
    attempt: input.attempt,
    level: input.level,
    message,
    create_timestamp: new Date(),
  });
}

/**
 * 仅在当前任务 lease 仍有效时追加脚本结构化日志。
 *
 * @param input 任务、lease、attempt、级别和已脱敏消息。
 * @returns 日志与 lease 守卫同事务写入时返回 true。
 */
export async function appendTaskRuntimeLog(input: {
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
}): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const guarded = await guardTaskLease(tx, input.taskId, input.leaseId);
    if (!guarded) return false;
    await appendTaskLog(
      {
        taskId: input.taskId,
        attempt: input.attempt,
        level: input.level,
        message: input.message,
      },
      tx,
    );
    return true;
  });
}

/**
 * 取消 queued、retrying 或 running 任务并执行脚本生命周期。
 *
 * @param taskId 通用任务标识。
 * @param options 取消用户、稳定错误码和安全原因。
 * @param onCancel 脚本可选取消生命周期函数。
 * @returns 实际取消活动任务时返回 true。
 */
export async function cancelTask(
  taskId: string,
  options: TaskCancelOptions,
  onCancel?: TaskScriptModule['onCancel'],
): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        data: schemas.tasks.data,
        attemptId: schemas.tasks.current_attempt_id,
        attempt: schemas.tasks.attempt_count,
        status: schemas.tasks.status,
      })
      .from(schemas.tasks)
      .where(eq(schemas.tasks.task_id, taskId))
      .for('update')
      .limit(1);
    if (!current) return false;
    if (!['queued', 'running', 'retrying'].includes(current.status)) return false;
    const now = new Date();
    const errorCode = options.errorCode ?? 'TASK_CANCELED';
    const message = options.message ?? '任务已取消';
    await tx
      .update(schemas.tasks)
      .set({
        status: 'canceled',
        next_run_at: null,
        lease_id: null,
        lease_expires_at: null,
        current_attempt_id: null,
        error_code: errorCode,
        error_message: message,
        end_timestamp: now,
        last_update_timestamp: now,
      })
      .where(eq(schemas.tasks.task_id, taskId));
    if (current.attemptId) {
      await tx
        .update(schemas.task_attempts)
        .set({
          status: 'canceled',
          error_code: errorCode,
          error_message: message,
          end_timestamp: now,
        })
        .where(
          and(
            eq(schemas.task_attempts.attempt_id, current.attemptId),
            eq(schemas.task_attempts.status, 'running'),
          ),
        );
    }
    await onCancel?.({
      taskId,
      data: current.data,
      userId: options.userId ?? null,
      errorCode,
      errorMessage: message,
      transaction: tx,
    });
    await appendTaskLog(
      {
        taskId,
        attempt: current.attempt,
        level: 'info',
        message,
      },
      tx,
    );
    return true;
  });
}

/**
 * 返回一轮调度可尝试领取的等待任务。
 *
 * @param limit 最大候选数量。
 * @returns 按创建时间排列的候选任务。
 */
export async function listRunnableTaskCandidates(
  limit: number,
): Promise<RunnableTaskCandidate[]> {
  if (limit <= 0) return [];
  const now = new Date();
  const runnable = or(
    eq(schemas.tasks.status, 'queued'),
    and(
      eq(schemas.tasks.status, 'retrying'),
      lte(schemas.tasks.next_run_at, now),
    ),
  );
  return await db
    .select({
      taskId: schemas.tasks.task_id,
      name: schemas.tasks.task_name,
      concurrency: schemas.tasks.concurrency,
    })
    .from(schemas.tasks)
    .where(runnable)
    .orderBy(asc(schemas.tasks.create_timestamp))
    .limit(limit);
}

/**
 * 原子领取等待任务并在同一事务创建新 attempt。
 *
 * @param taskId 候选任务标识。
 * @param workerId 当前服务实例标识。
 * @param leaseDurationMs 单次 lease 有效期。
 * @returns 领取成功后的监督快照；状态已变化时返回 undefined。
 */
export async function claimTask(
  taskId: string,
  workerId: string,
  leaseDurationMs: number,
): Promise<ClaimedTask | undefined> {
  return await db.transaction(async (tx) => {
    const now = new Date();
    const attemptId = uuidv7();
    const leaseId = uuidv7();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    const runnable = or(
      eq(schemas.tasks.status, 'queued'),
      and(
        eq(schemas.tasks.status, 'retrying'),
        lte(schemas.tasks.next_run_at, now),
      ),
    );
    const [claimed] = await tx
      .update(schemas.tasks)
      .set({
        status: 'running',
        current_stage: null,
        progress: 0,
        processed_items: 0,
        total_items: 0,
        result: null,
        attempt_count: sql`${schemas.tasks.attempt_count} + 1`,
        current_attempt_id: attemptId,
        lease_id: leaseId,
        lease_expires_at: leaseExpiresAt,
        next_run_at: null,
        start_timestamp: sql`coalesce(${schemas.tasks.start_timestamp}, ${now})`,
        end_timestamp: null,
        error_code: null,
        error_message: null,
        last_update_timestamp: now,
      })
      .where(and(eq(schemas.tasks.task_id, taskId), runnable))
      .returning({
        name: schemas.tasks.task_name,
        script: schemas.tasks.script,
        attempt: schemas.tasks.attempt_count,
        data: schemas.tasks.data,
        timeoutMs: schemas.tasks.timeout_ms,
        concurrency: schemas.tasks.concurrency,
      });
    if (!claimed) return;
    await tx.insert(schemas.task_attempts).values({
      attempt_id: attemptId,
      task_id: taskId,
      attempt: claimed.attempt,
      status: 'running',
      lease_id: leaseId,
      worker_id: workerId,
      process_id: null,
      error_code: null,
      error_message: null,
      result: null,
      start_timestamp: now,
      end_timestamp: null,
    });
    await appendTaskLog(
      {
        taskId,
        attempt: claimed.attempt,
        level: 'info',
        message: `开始第 ${claimed.attempt} 次执行`,
      },
      tx,
    );
    return {
      taskId,
      name: claimed.name,
      script: claimed.script,
      attemptId,
      attempt: claimed.attempt,
      leaseId,
      data: claimed.data,
      timeoutMs: claimed.timeoutMs,
      concurrency: claimed.concurrency,
    };
  });
}

/**
 * 保存当前 attempt 启动后的子进程 PID。
 *
 * @param attemptId 当前 attempt 标识。
 * @param processId Node.js 子进程 PID。
 * @returns 当前 attempt 仍在运行时返回 true。
 */
export async function setTaskProcessId(
  attemptId: string,
  processId: number,
): Promise<boolean> {
  const [updated] = await db
    .update(schemas.task_attempts)
    .set({ process_id: processId })
    .where(
      and(
        eq(schemas.task_attempts.attempt_id, attemptId),
        eq(schemas.task_attempts.status, 'running'),
      ),
    )
    .returning({ attemptId: schemas.task_attempts.attempt_id });
  return Boolean(updated);
}

/**
 * 延长当前 Worker 持有的任务 lease。
 *
 * @param taskId 通用任务标识。
 * @param leaseId 当前领取生成的 lease。
 * @param leaseDurationMs 新 lease 有效期。
 * @returns 任务仍为当前 lease 所有时返回 true。
 */
export async function renewTaskLease(
  taskId: string,
  leaseId: string,
  leaseDurationMs: number,
): Promise<boolean> {
  const now = new Date();
  const [updated] = await db
    .update(schemas.tasks)
    .set({
      lease_expires_at: new Date(now.getTime() + leaseDurationMs),
      last_update_timestamp: now,
    })
    .where(buildActiveLeaseWhere(taskId, leaseId))
    .returning({ taskId: schemas.tasks.task_id });
  return Boolean(updated);
}

/**
 * 判断任务是否仍由指定 lease 持有。
 *
 * @param taskId 通用任务标识。
 * @param leaseId 当前子进程收到的 lease。
 * @returns 任务仍在运行且 lease 一致时返回 true。
 */
export async function assertTaskLeaseActive(
  taskId: string,
  leaseId: string,
): Promise<boolean> {
  const [task] = await db
    .select({ taskId: schemas.tasks.task_id })
    .from(schemas.tasks)
    .where(buildActiveLeaseWhere(taskId, leaseId))
    .limit(1);
  return Boolean(task);
}

/**
 * 在 task 包内部事务中原子确认并刷新当前任务 lease。
 *
 * @param transaction 业务结果共享事务。
 * @param taskId 通用任务标识。
 * @param leaseId 当前子进程持有的 lease。
 * @returns 任务仍由当前 lease 持有时返回 true。
 */
export async function guardTaskLease(
  transaction: TaskScriptTransaction,
  taskId: string,
  leaseId: string,
): Promise<boolean> {
  const [guarded] = await transaction
    .update(schemas.tasks)
    .set({ last_update_timestamp: new Date() })
    .where(buildActiveLeaseWhere(taskId, leaseId))
    .returning({ taskId: schemas.tasks.task_id });
  return Boolean(guarded);
}

/**
 * 使用当前 lease 更新任务脚本报告的进度。
 *
 * @param input 任务、lease、阶段、进度和数量摘要。
 * @returns 当前 lease 更新成功时返回 true。
 */
export async function updateTaskRuntimeProgress(
  input: {
    /** 通用任务标识。 */
    taskId: string;
    /** 当前领取生成的 lease。 */
    leaseId: string;
  } & TaskProgressInput,
): Promise<boolean> {
  const [updated] = await db
    .update(schemas.tasks)
    .set({
      current_stage: input.stage,
      progress: input.progress,
      processed_items: input.processedItems,
      total_items: input.totalItems,
      last_update_timestamp: new Date(),
    })
    .where(buildActiveLeaseWhere(input.taskId, input.leaseId))
    .returning({ taskId: schemas.tasks.task_id });
  return Boolean(updated);
}

/**
 * 收敛当前 attempt，并根据策略进入成功、重试或最终失败状态。
 *
 * @param input 当前 lease、attempt、结果和安全错误。
 * @returns 是否收敛、是否重试及最终状态。
 */
export async function settleTaskAttempt(
  input: SettleTaskAttemptInput,
): Promise<SettleTaskAttemptResult> {
  return await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        data: schemas.tasks.data,
        attempt: schemas.tasks.attempt_count,
        maxRetries: schemas.tasks.max_retries,
        retryDelayMs: schemas.tasks.retry_delay_ms,
        status: schemas.tasks.status,
        attemptId: schemas.tasks.current_attempt_id,
        leaseId: schemas.tasks.lease_id,
      })
      .from(schemas.tasks)
      .where(eq(schemas.tasks.task_id, input.taskId))
      .for('update')
      .limit(1);
    if (
      !current ||
      current.status !== 'running' ||
      current.attemptId !== input.attemptId ||
      current.leaseId !== input.leaseId
    ) {
      return { settled: false, retryScheduled: false };
    }
    const now = new Date();
    const decision = decideTaskSettlement({
      outcome: input.outcome,
      attempt: current.attempt,
      maxRetries: current.maxRetries,
      retryDelayMs: current.retryDelayMs,
      now,
    });
    if (decision.taskStatus === 'succeeded') {
      const result = normalizeTaskResult(input.result);
      await finishAttemptRecord(
        tx,
        input.attemptId,
        'succeeded',
        now,
        null,
        null,
        result,
      );
      await tx
        .update(schemas.tasks)
        .set({
          status: 'succeeded',
          progress: 100,
          next_run_at: null,
          current_attempt_id: null,
          lease_id: null,
          lease_expires_at: null,
          error_code: null,
          error_message: null,
          result,
          end_timestamp: now,
          last_update_timestamp: now,
        })
        .where(eq(schemas.tasks.task_id, input.taskId));
      await appendTaskLog(
        {
          taskId: input.taskId,
          attempt: current.attempt,
          level: 'info',
          message: `第 ${current.attempt} 次执行成功`,
        },
        tx,
      );
      return {
        settled: true,
        retryScheduled: false,
        terminalStatus: 'succeeded',
      };
    }
    const error = normalizeAttemptError(input);
    await finishAttemptRecord(
      tx,
      input.attemptId,
      decision.attemptStatus,
      now,
      error.code,
      error.message,
    );
    if (decision.taskStatus === 'retrying') {
      if (!decision.nextRunAt) {
        throw new Error('TASK_STATE_INVALID: retrying 缺少下次执行时间');
      }
      const nextRunAt = decision.nextRunAt;
      await tx
        .update(schemas.tasks)
        .set({
          status: 'retrying',
          next_run_at: nextRunAt,
          current_attempt_id: null,
          lease_id: null,
          lease_expires_at: null,
          error_code: error.code,
          error_message: error.message,
          last_update_timestamp: now,
        })
        .where(eq(schemas.tasks.task_id, input.taskId));
      await appendTaskLog(
        {
          taskId: input.taskId,
          attempt: current.attempt,
          level: 'error',
          message: `${error.message}；将在 ${nextRunAt.toISOString()} 重试`,
        },
        tx,
      );
      return { settled: true, retryScheduled: true };
    }
    const terminalStatus = decision.taskStatus;
    await tx
      .update(schemas.tasks)
      .set({
        status: terminalStatus,
        next_run_at: null,
        current_attempt_id: null,
        lease_id: null,
        lease_expires_at: null,
        error_code: error.code,
        error_message: error.message,
        end_timestamp: now,
        last_update_timestamp: now,
      })
      .where(eq(schemas.tasks.task_id, input.taskId));
    await input.onTerminalFailure?.({
      taskId: input.taskId,
      data: current.data,
      transaction: tx,
      errorCode: error.code,
      errorMessage: error.message,
      reason: readFailureOutcome(input.outcome),
    });
    await appendTaskLog(
      {
        taskId: input.taskId,
        attempt: current.attempt,
        level: 'error',
        message: error.message,
      },
      tx,
    );
    return { settled: true, retryScheduled: false, terminalStatus };
  });
}

/**
 * 查询已经超过 lease 到期时间的运行任务。
 *
 * @param limit 单轮恢复上限。
 * @returns 恢复收敛所需的任务、attempt 和 lease。
 */
export async function listExpiredRunningTasks(limit: number) {
  return await db
    .select({
      taskId: schemas.tasks.task_id,
      script: schemas.tasks.script,
      attemptId: schemas.tasks.current_attempt_id,
      leaseId: schemas.tasks.lease_id,
    })
    .from(schemas.tasks)
    .where(
      and(
        eq(schemas.tasks.status, 'running'),
        lt(schemas.tasks.lease_expires_at, new Date()),
      ),
    )
    .orderBy(asc(schemas.tasks.lease_expires_at))
    .limit(limit);
}

/**
 * 把任务中心过滤条件转换为 Drizzle WHERE。
 *
 * @param filter 任务中心过滤条件。
 * @returns 可直接用于任务查询的条件；无条件时返回 undefined。
 */
function taskFilterToWhere(filter: TaskSqlFilter = {}) {
  const conditions: SQL[] = [];
  if (filter.task_id) {
    conditions.push(eq(schemas.tasks.task_id, filter.task_id));
  }
  if (filter.name) {
    if (Array.isArray(filter.name)) {
      if (filter.name.length) {
        conditions.push(inArray(schemas.tasks.task_name, filter.name));
      }
    } else {
      conditions.push(eq(schemas.tasks.task_name, filter.name));
    }
  }
  if (filter.status) {
    if (Array.isArray(filter.status)) {
      if (filter.status.length) {
        conditions.push(inArray(schemas.tasks.status, filter.status));
      }
    } else {
      conditions.push(eq(schemas.tasks.status, filter.status));
    }
  }
  if (filter.current_stage) {
    if (Array.isArray(filter.current_stage)) {
      if (filter.current_stage.length) {
        conditions.push(
          inArray(schemas.tasks.current_stage, filter.current_stage),
        );
      }
    } else {
      conditions.push(eq(schemas.tasks.current_stage, filter.current_stage));
    }
  }
  const search = filter.search?.trim();
  if (search) {
    conditions.push(ilike(schemas.tasks.task_name, `%${search}%`));
  }
  if (filter.create_timestamp?.[0]) {
    conditions.push(
      gte(schemas.tasks.create_timestamp, filter.create_timestamp[0]),
    );
  }
  if (filter.create_timestamp?.[1]) {
    conditions.push(
      lte(schemas.tasks.create_timestamp, filter.create_timestamp[1]),
    );
  }
  if (!conditions.length) return;
  return and(...conditions);
}

/**
 * 校验分页区间并转换为 offset 和 size。
 *
 * @param limit `[offset, end)` 区间。
 * @returns 非负 offset 和正数 size。
 */
function normalizePageRange(limit: number[] | undefined): [number, number] {
  if (!limit || limit.length < 2) return [0, 10];
  const offset = Math.max(0, Math.floor(limit[0] ?? 0));
  const end = Math.max(offset, Math.floor(limit[1] ?? offset));
  return [offset, Math.max(1, end - offset)];
}

/**
 * 通过 JSON 往返拒绝函数、循环引用和 undefined 根值。
 *
 * @param result 任务脚本返回的未知结果。
 * @returns 可安全交给 JSONB 驱动的数据，undefined 转换为空。
 */
function normalizeTaskResult(result: unknown): unknown {
  if (result === undefined) return null;
  const serialized = JSON.stringify(result);
  if (serialized === undefined) {
    throw new Error('TASK_RESULT_INVALID: 任务结果无法序列化');
  }
  return JSON.parse(serialized) as unknown;
}

/**
 * 构造只允许当前 running lease 修改任务的条件。
 *
 * @param taskId 通用任务标识。
 * @param leaseId 当前领取生成的 lease。
 * @returns 同时校验任务、状态和 lease 的条件。
 */
function buildActiveLeaseWhere(taskId: string, leaseId: string) {
  return and(
    eq(schemas.tasks.task_id, taskId),
    eq(schemas.tasks.status, 'running'),
    eq(schemas.tasks.lease_id, leaseId),
    gte(schemas.tasks.lease_expires_at, new Date()),
  );
}

/**
 * 终结单条 attempt 记录。
 *
 * @param transaction 当前任务状态事务。
 * @param attemptId 当前 attempt 标识。
 * @param status attempt 最终状态。
 * @param now 统一完成时间。
 * @param errorCode 可选稳定错误码。
 * @param errorMessage 可选安全错误摘要。
 * @param result 任务脚本成功返回的可序列化结果。
 * @returns 更新完成后结束。
 */
async function finishAttemptRecord(
  transaction: TaskScriptTransaction,
  attemptId: string,
  status: TaskAttemptStatus,
  now: Date,
  errorCode: string | null = null,
  errorMessage: string | null = null,
  result: unknown = null,
): Promise<void> {
  await transaction
    .update(schemas.task_attempts)
    .set({
      status,
      error_code: errorCode,
      error_message: errorMessage,
      result,
      end_timestamp: now,
    })
    .where(
      and(
        eq(schemas.task_attempts.attempt_id, attemptId),
        eq(schemas.task_attempts.status, 'running'),
      ),
    );
}

/**
 * 为不同异常出口生成稳定错误码和安全消息。
 *
 * @param input 当前 attempt 收敛输入。
 * @returns 非空错误码和摘要。
 */
function normalizeAttemptError(input: SettleTaskAttemptInput): {
  code: string;
  message: string;
} {
  let code = input.errorCode?.trim();
  let message = input.errorMessage?.trim();
  if (!code) {
    if (input.outcome === 'timed_out') code = 'TASK_TIMED_OUT';
    else if (input.outcome === 'interrupted') code = 'TASK_WORKER_LOST';
    else code = 'TASK_FAILED';
  }
  if (!message) {
    if (input.outcome === 'timed_out') message = '任务执行超时';
    else if (input.outcome === 'interrupted') message = '任务执行进程异常中断';
    else message = '任务执行失败';
  }
  return { code, message: message.slice(0, 1_000) };
}

/**
 * 在失败收敛分支读取非成功结果，防止成功结果进入终态回调。
 *
 * @param outcome 父 Worker 识别的执行结果。
 * @returns 失败、超时或中断原因。
 */
function readFailureOutcome(
  outcome: TaskAttemptOutcome,
): Exclude<TaskAttemptOutcome, 'succeeded'> {
  if (outcome === 'succeeded') {
    throw new Error('TASK_STATE_INVALID: 成功结果不能进入失败回调');
  }
  return outcome;
}
