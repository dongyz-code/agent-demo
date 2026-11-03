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
import { alias } from 'drizzle-orm/pg-core';

import { db, pgAdvisoryXactLock, schemas } from '@/database/index.js';
import { uuidv7 } from '@/utils/index.js';
import type {
  TaskAttemptStatus,
  TaskLogLevel,
  TaskSqlFilter,
  TaskStatus,
} from '@repo/types';
import type { SQL } from 'drizzle-orm';
import { normalizeTaskPage, shouldRetryTaskAttempt } from './policies.js';
import type {
  ClaimedTask,
  RunnableTaskCandidate,
  SettleTaskAttemptInput,
  SettleTaskAttemptResult,
  TaskCancelOptions,
  TaskDetail,
  TaskListOptions,
  TaskLogOptions,
  TaskPolicySnapshot,
  TaskProgressInput,
  TaskTransaction,
} from './types.js';

/** 支持任务入队与日志写入的数据库执行器。 */
type TaskInsertExecutor = Pick<typeof db, 'insert' | 'select'>;

/** 任务列表和详情对外返回的稳定字段。 */
const TASK_PUBLIC_FIELDS = {
  task_id: schemas.tasks.task_id,
  script_path: schemas.tasks.script_path,
  correlation_id: schemas.tasks.correlation_id,
  group_name: schemas.tasks.group_name,
  display_name: schemas.tasks.display_name,
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

/** 单任务详情额外返回调用方保存的执行数据。 */
const TASK_DETAIL_FIELDS = {
  ...TASK_PUBLIC_FIELDS,
  data: schemas.tasks.data,
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

/** 候选查询中用于统计同分组运行任务数量的任务表别名。 */
const RUNNING_TASK = alias(schemas.tasks, 'running_task');

/**
 * 聚合通用任务的查询、事务、执行权与状态迁移。
 */
export class TaskDatabase {
  /**
   * 创建任务数据库访问入口。
   *
   * @param connection 通用任务表使用的 Drizzle 数据库连接。
   */
  constructor(private readonly connection: typeof db = db) {}

  // 公共任务操作：创建、查询、日志与取消。

  /**
   * 在可选事务中写入任务主记录和入队日志。
   *
   * @param snapshot 脚本入口、并发分组、展示名称和策略快照。
   * @param data 会 JSON 序列化并传给任务脚本的数据。
   * @param options 可预先分配的任务标识和共享事务。
   * @returns 新建任务标识。
   */
  async addTask<TData>(
    snapshot: TaskPolicySnapshot,
    data: TData,
    options: {
      /** 调用方预分配的任务标识。 */
      taskId?: string;
      /** 业务方用于关联领域对象的稳定标识。 */
      correlationId?: string | null;
      /** 与领域写入共享的事务。 */
      transaction?: TaskTransaction;
    } = {},
  ): Promise<string> {
    if (options.taskId !== undefined && !options.taskId.trim()) {
      throw new Error('TASK_ID_INVALID: 任务标识不能为空');
    }
    const taskId = options.taskId ?? uuidv7();
    const insert = async (transaction: TaskTransaction): Promise<void> => {
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(data);
      } catch {
        throw new Error('TASK_DATA_INVALID: 任务数据无法序列化');
      }
      if (serialized === undefined) {
        throw new Error('TASK_DATA_INVALID: 任务数据无法序列化');
      }
      const storedData = JSON.parse(serialized) as TData;
      const now = new Date();
      await transaction.insert(schemas.tasks).values({
        task_id: taskId,
        script_path: snapshot.scriptPath,
        correlation_id: options.correlationId ?? null,
        group_name: snapshot.groupName,
        display_name: snapshot.displayName,
        data: storedData,
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
      await this.appendTaskLog(
        {
          taskId,
          attempt: 0,
          level: 'info',
          message: `任务已进入队列：${snapshot.displayName}`,
        },
        transaction,
      );
    };
    if (options.transaction) await insert(options.transaction);
    else await this.connection.transaction(insert);
    return taskId;
  }

  /**
   * 查询单个通用任务及全部 attempt。
   *
   * @param taskId 通用任务标识。
   * @returns 任务不存在或类型不匹配时返回 null。
   */
  async getTask<TData = unknown, TResult = unknown>(
    taskId: string,
  ): Promise<TaskDetail<TData, TResult> | null> {
    const conditions: SQL[] = [eq(schemas.tasks.task_id, taskId)];
    const [item] = await this.connection
      .select(TASK_DETAIL_FIELDS)
      .from(schemas.tasks)
      .where(and(...conditions))
      .limit(1);
    if (!item) return null;
    const attempts = await this.connection
      .select(TASK_ATTEMPT_PUBLIC_FIELDS)
      .from(schemas.task_attempts)
      .where(eq(schemas.task_attempts.task_id, taskId))
      .orderBy(asc(schemas.task_attempts.attempt));
    return {
      ...item,
      data: item.data as TData,
      result: item.result as TResult | null,
      attempts,
    };
  }

  /**
   * 批量读取业务协调需要的任务输入与状态，不加载每次 attempt。
   *
   * @typeParam TData 由任务脚本约定的持久化输入类型。
   * @param taskIds 已由业务关联范围筛选的任务标识。
   * @param executor 可选领域事务，保证状态判断与领域变更使用相同提交边界。
   * @returns 按传入标识顺序排列的现存任务，跳过已不存在的记录。
   */
  async getTasks<TData = unknown>(
    taskIds: string[],
    executor: Pick<typeof db, 'select'> = this.connection,
  ) {
    if (!taskIds.length) return [];
    const rows = await executor
      .select(TASK_DETAIL_FIELDS)
      .from(schemas.tasks)
      .where(inArray(schemas.tasks.task_id, taskIds));
    const byId = new Map(rows.map((row) => [row.task_id, row]));
    return taskIds.flatMap((taskId) => {
      const row = byId.get(taskId);
      if (!row) return [];
      return [{ ...row, data: row.data as TData }];
    });
  }

  /**
   * 分页查询通用任务。
   *
   * @param options 过滤、分页和计数开关。
   * @returns 当前页任务和可选总数。
   */
  async listTasks(options: TaskListOptions = {}) {
    const executor = options.transaction ?? this.connection;
    const where = this.taskWhere(options.filter);
    const { offset, size } = normalizeTaskPage(options.limit);
    const listPromise = executor
      .select(TASK_PUBLIC_FIELDS)
      .from(schemas.tasks)
      .where(where)
      .orderBy(
        desc(schemas.tasks.create_timestamp),
        desc(schemas.tasks.task_id),
      )
      .offset(offset)
      .limit(size);
    let countPromise: Promise<{ value: number }[]> = Promise.resolve([]);
    if (options.withCount) {
      countPromise = executor
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
  async countTasksByStatus(filter: TaskSqlFilter = {}) {
    const rows = await this.connection
      .select({ status: schemas.tasks.status, count: countSql() })
      .from(schemas.tasks)
      .where(this.taskWhere(filter))
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
  async readTaskLogs(taskId: string, options: TaskLogOptions = {}) {
    const conditions: SQL[] = [eq(schemas.task_logs.task_id, taskId)];
    if (options.attempt !== undefined) {
      conditions.push(eq(schemas.task_logs.attempt, options.attempt));
    }
    return await this.connection
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
  async appendTaskLog(
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
    executor?: TaskInsertExecutor,
  ): Promise<void> {
    const message = input.message.trim();
    if (!message) return;
    await (executor ?? this.connection).insert(schemas.task_logs).values({
      log_id: uuidv7(),
      task_id: input.taskId,
      attempt: input.attempt,
      level: input.level,
      message,
      create_timestamp: new Date(),
    });
  }

  /**
   * 仅在当前任务 lease 仍有效时追加任务定义日志。
   *
   * @param input 任务、lease、attempt、级别和已脱敏消息。
   * @returns 日志与 lease 守卫同事务写入时返回 true。
   */
  async appendTaskRuntimeLog(input: {
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
    return await this.connection.transaction(async (tx) => {
      const guarded = await this.guardTaskLease(
        tx,
        input.taskId,
        input.leaseId,
      );
      if (!guarded) return false;
      await this.appendTaskLog(
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
   * 取消 queued、retrying 或 running 任务。
   *
   * @param taskId 通用任务标识。
   * @param options 取消用户、稳定错误码、安全原因和可选共享事务。
   * @returns 实际取消活动任务时返回 true。
   */
  async cancelTask(
    taskId: string,
    options: TaskCancelOptions,
  ): Promise<boolean> {
    const cancel = async (tx: TaskTransaction): Promise<boolean> => {
      const [current] = await tx
        .select({
          attemptId: schemas.tasks.current_attempt_id,
          attempt: schemas.tasks.attempt_count,
          status: schemas.tasks.status,
        })
        .from(schemas.tasks)
        .where(eq(schemas.tasks.task_id, taskId))
        .for('update')
        .limit(1);
      if (!current) return false;
      if (!['queued', 'running', 'retrying'].includes(current.status)) {
        return false;
      }
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
      await this.appendTaskLog(
        {
          taskId,
          attempt: current.attempt,
          level: 'info',
          message,
        },
        tx,
      );
      return true;
    };
    if (options.transaction) return await cancel(options.transaction);
    return await this.connection.transaction(cancel);
  }

  // Dispatcher 执行权：候选、领取、PID、lease 与运行进度。

  /**
   * 返回一轮调度可尝试领取的等待任务。
   *
   * 查询会排除全局同分组运行数已经达到并发上限的任务，避免固定候选窗口被
   * 暂时不可领取的任务占满。
   *
   * @param limit 最大候选数量。
   * @returns 按创建时间排列的候选任务。
   */
  async listRunnableTaskCandidates(
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
    const hasGroupCapacity = sql<boolean>`(
      select count(*)
      from ${RUNNING_TASK}
      where ${RUNNING_TASK.group_name} = ${schemas.tasks.group_name}
        and ${RUNNING_TASK.status} = 'running'
    ) < ${schemas.tasks.concurrency}`;
    return await this.connection
      .select({
        taskId: schemas.tasks.task_id,
        groupName: schemas.tasks.group_name,
        concurrency: schemas.tasks.concurrency,
      })
      .from(schemas.tasks)
      .where(and(runnable, hasGroupCapacity))
      .orderBy(asc(schemas.tasks.create_timestamp))
      .limit(limit);
  }

  /**
   * 原子领取等待任务并在同一事务创建新 attempt。
   *
   * @param taskId 候选任务标识。
   * @param dispatcherId 当前持有任务 lease 的服务调度实例标识。
   * @param leaseDurationMs 单次 lease 有效期。
   * @returns 领取成功后的监督快照；状态或分组并发不允许时返回 undefined。
   */
  async claimTask(
    taskId: string,
    dispatcherId: string,
    leaseDurationMs: number,
  ): Promise<ClaimedTask | undefined> {
    return await this.connection.transaction(async (tx) => {
      const now = new Date();
      const runnable = or(
        eq(schemas.tasks.status, 'queued'),
        and(
          eq(schemas.tasks.status, 'retrying'),
          lte(schemas.tasks.next_run_at, now),
        ),
      );
      const [candidate] = await tx
        .select({
          groupName: schemas.tasks.group_name,
          concurrency: schemas.tasks.concurrency,
        })
        .from(schemas.tasks)
        .where(and(eq(schemas.tasks.task_id, taskId), runnable))
        .for('update')
        .limit(1);
      if (!candidate) return;
      await pgAdvisoryXactLock(tx, 'task-group', candidate.groupName);
      const [running] = await tx
        .select({ value: countSql() })
        .from(schemas.tasks)
        .where(
          and(
            eq(schemas.tasks.group_name, candidate.groupName),
            eq(schemas.tasks.status, 'running'),
          ),
        );
      if ((running?.value ?? 0) >= candidate.concurrency) return;
      const attemptId = uuidv7();
      const leaseId = uuidv7();
      const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
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
          scriptPath: schemas.tasks.script_path,
          groupName: schemas.tasks.group_name,
          attempt: schemas.tasks.attempt_count,
          data: schemas.tasks.data,
          checkpoint: schemas.tasks.checkpoint,
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
        worker_id: dispatcherId,
        process_id: null,
        error_code: null,
        error_message: null,
        result: null,
        start_timestamp: now,
        end_timestamp: null,
      });
      return {
        taskId,
        scriptPath: claimed.scriptPath,
        groupName: claimed.groupName,
        attemptId,
        attempt: claimed.attempt,
        leaseId,
        data: claimed.data,
        checkpoint: claimed.checkpoint,
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
  async setTaskProcessId(
    attemptId: string,
    processId: number,
  ): Promise<boolean> {
    const [updated] = await this.connection
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
   * 延长当前 Dispatcher 持有的任务 lease。
   *
   * @param taskId 通用任务标识。
   * @param leaseId 当前领取生成的 lease。
   * @param leaseDurationMs 新 lease 有效期。
   * @returns 任务仍为当前 lease 所有时返回 true。
   */
  async renewTaskLease(
    taskId: string,
    leaseId: string,
    leaseDurationMs: number,
  ): Promise<boolean> {
    const now = new Date();
    const [updated] = await this.connection
      .update(schemas.tasks)
      .set({
        lease_expires_at: new Date(now.getTime() + leaseDurationMs),
        last_update_timestamp: now,
      })
      .where(this.activeLeaseWhere(taskId, leaseId))
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
  async assertTaskLeaseActive(
    taskId: string,
    leaseId: string,
  ): Promise<boolean> {
    const [task] = await this.connection
      .select({ taskId: schemas.tasks.task_id })
      .from(schemas.tasks)
      .where(this.activeLeaseWhere(taskId, leaseId))
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
  async guardTaskLease(
    transaction: TaskTransaction,
    taskId: string,
    leaseId: string,
  ): Promise<boolean> {
    const [guarded] = await transaction
      .update(schemas.tasks)
      .set({ last_update_timestamp: new Date() })
      .where(this.activeLeaseWhere(taskId, leaseId))
      .returning({ taskId: schemas.tasks.task_id });
    return Boolean(guarded);
  }

  /**
   * 使用当前 lease 更新任务定义报告的进度。
   *
   * @param input 任务、lease、阶段、进度和数量摘要。
   * @returns 当前 lease 更新成功时返回 true。
   */
  async updateTaskRuntimeProgress(
    input: {
      /** 通用任务标识。 */
      taskId: string;
      /** 当前领取生成的 lease。 */
      leaseId: string;
    } & TaskProgressInput,
  ): Promise<boolean> {
    const [updated] = await this.connection
      .update(schemas.tasks)
      .set({
        current_stage: input.stage,
        progress: input.progress,
        processed_items: input.processedItems,
        total_items: input.totalItems,
        last_update_timestamp: new Date(),
      })
      .where(this.activeLeaseWhere(input.taskId, input.leaseId))
      .returning({ taskId: schemas.tasks.task_id });
    return Boolean(updated);
  }

  /**
   * 仅在当前任务 lease 仍有效时保存 checkpoint。
   *
   * @param taskId 通用任务标识。
   * @param leaseId 当前领取生成的 lease。
   * @param checkpoint 可 JSON 序列化的轻量恢复信息。
   * @returns 当前 lease 仍有效时返回 true。
   */
  async saveTaskRuntimeCheckpoint(
    taskId: string,
    leaseId: string,
    checkpoint: unknown,
  ): Promise<boolean> {
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(checkpoint);
    } catch {
      throw new Error('TASK_CHECKPOINT_INVALID: 恢复信息无法序列化');
    }
    if (serialized === undefined) {
      throw new Error('TASK_CHECKPOINT_INVALID: 恢复信息无法序列化');
    }
    const [updated] = await this.connection
      .update(schemas.tasks)
      .set({
        checkpoint: JSON.parse(serialized) as unknown,
        last_update_timestamp: new Date(),
      })
      .where(this.activeLeaseWhere(taskId, leaseId))
      .returning({ taskId: schemas.tasks.task_id });
    return Boolean(updated);
  }

  // 状态收敛与恢复：完成 attempt，并回收已经过期的 lease。

  /**
   * 收敛当前 attempt，并根据策略进入成功、重试或最终失败状态。
   *
   * @param input 当前 lease、attempt、结果和安全错误。
   * @returns 是否收敛、是否重试及最终状态。
   */
  async settleTaskAttempt(
    input: SettleTaskAttemptInput,
  ): Promise<SettleTaskAttemptResult> {
    return await this.connection.transaction(async (tx) => {
      const [current] = await tx
        .select({
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
      if (input.outcome === 'succeeded') {
        let result: unknown = null;
        if (input.result !== undefined) {
          const serialized = JSON.stringify(input.result);
          if (serialized === undefined) {
            throw new Error('TASK_RESULT_INVALID: 任务结果无法序列化');
          }
          result = JSON.parse(serialized) as unknown;
        }
        await tx
          .update(schemas.task_attempts)
          .set({
            status: 'succeeded',
            error_code: null,
            error_message: null,
            result,
            end_timestamp: now,
          })
          .where(
            and(
              eq(schemas.task_attempts.attempt_id, input.attemptId),
              eq(schemas.task_attempts.status, 'running'),
            ),
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
        return {
          settled: true,
          retryScheduled: false,
          terminalStatus: 'succeeded',
        };
      }
      let errorCode = input.errorCode?.trim();
      let errorMessage = input.errorMessage?.trim();
      if (!errorCode) {
        if (input.outcome === 'timed_out') errorCode = 'TASK_TIMED_OUT';
        else if (input.outcome === 'interrupted')
          errorCode = 'TASK_WORKER_LOST';
        else errorCode = 'TASK_FAILED';
      }
      if (!errorMessage) {
        if (input.outcome === 'timed_out') errorMessage = '任务执行超时';
        else if (input.outcome === 'interrupted') {
          errorMessage = '任务执行进程异常中断';
        } else errorMessage = '任务执行失败';
      }
      errorMessage = errorMessage.slice(0, 1_000);
      let attemptStatus: TaskAttemptStatus = 'failed';
      if (input.outcome === 'timed_out') attemptStatus = 'timed_out';
      if (input.outcome === 'interrupted') attemptStatus = 'interrupted';
      const retryScheduled = shouldRetryTaskAttempt(
        current.attempt,
        current.maxRetries,
      );
      await tx
        .update(schemas.task_attempts)
        .set({
          status: attemptStatus,
          error_code: errorCode,
          error_message: errorMessage,
          result: null,
          end_timestamp: now,
        })
        .where(
          and(
            eq(schemas.task_attempts.attempt_id, input.attemptId),
            eq(schemas.task_attempts.status, 'running'),
          ),
        );
      if (retryScheduled) {
        const nextRunAt = new Date(now.getTime() + current.retryDelayMs);
        await tx
          .update(schemas.tasks)
          .set({
            status: 'retrying',
            next_run_at: nextRunAt,
            current_attempt_id: null,
            lease_id: null,
            lease_expires_at: null,
            error_code: errorCode,
            error_message: errorMessage,
            last_update_timestamp: now,
          })
          .where(eq(schemas.tasks.task_id, input.taskId));
        await this.appendTaskLog(
          {
            taskId: input.taskId,
            attempt: current.attempt,
            level: 'error',
            message: `${errorMessage}；将在 ${nextRunAt.toISOString()} 重试`,
          },
          tx,
        );
        return { settled: true, retryScheduled: true };
      }
      let terminalStatus: Extract<TaskStatus, 'failed' | 'timed_out'> =
        'failed';
      if (input.outcome === 'timed_out') terminalStatus = 'timed_out';
      await tx
        .update(schemas.tasks)
        .set({
          status: terminalStatus,
          next_run_at: null,
          current_attempt_id: null,
          lease_id: null,
          lease_expires_at: null,
          error_code: errorCode,
          error_message: errorMessage,
          end_timestamp: now,
          last_update_timestamp: now,
        })
        .where(eq(schemas.tasks.task_id, input.taskId));
      await this.appendTaskLog(
        {
          taskId: input.taskId,
          attempt: current.attempt,
          level: 'error',
          message: errorMessage,
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
   * @returns 恢复收敛所需的 attempt 和 lease。
   */
  async listExpiredRunningTasks(limit: number) {
    return await this.connection
      .select({
        taskId: schemas.tasks.task_id,
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

  // 共享 SQL 守卫：只保留多处复用且影响并发安全的条件。

  /**
   * 把任务中心过滤条件转换为 Drizzle WHERE。
   *
   * @param filter 任务中心过滤条件。
   * @returns 可直接用于任务查询的条件；无条件时返回 undefined。
   */
  private taskWhere(filter: TaskSqlFilter = {}) {
    const conditions: SQL[] = [];
    if (filter.task_id) {
      conditions.push(eq(schemas.tasks.task_id, filter.task_id));
    }
    if (filter.script_path) {
      if (Array.isArray(filter.script_path)) {
        if (filter.script_path.length) {
          conditions.push(
            inArray(schemas.tasks.script_path, filter.script_path),
          );
        }
      } else {
        conditions.push(eq(schemas.tasks.script_path, filter.script_path));
      }
    }
    if (filter.correlation_id) {
      if (Array.isArray(filter.correlation_id)) {
        if (filter.correlation_id.length) {
          conditions.push(
            inArray(schemas.tasks.correlation_id, filter.correlation_id),
          );
        }
      } else {
        conditions.push(
          eq(schemas.tasks.correlation_id, filter.correlation_id),
        );
      }
    }
    if (filter.group_name) {
      if (Array.isArray(filter.group_name)) {
        if (filter.group_name.length) {
          conditions.push(inArray(schemas.tasks.group_name, filter.group_name));
        }
      } else {
        conditions.push(eq(schemas.tasks.group_name, filter.group_name));
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
      const typeSearch = or(
        ilike(schemas.tasks.script_path, `%${search}%`),
        ilike(schemas.tasks.display_name, `%${search}%`),
        ilike(schemas.tasks.correlation_id, `%${search}%`),
      );
      if (typeSearch) conditions.push(typeSearch);
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
   * 构造只允许当前 running lease 修改任务的条件。
   *
   * @param taskId 通用任务标识。
   * @param leaseId 当前领取生成的 lease。
   * @returns 同时校验任务、状态和 lease 的条件。
   */
  private activeLeaseWhere(taskId: string, leaseId: string) {
    return and(
      eq(schemas.tasks.task_id, taskId),
      eq(schemas.tasks.status, 'running'),
      eq(schemas.tasks.lease_id, leaseId),
      gte(schemas.tasks.lease_expires_at, new Date()),
    );
  }
}

/** 通用任务数据库状态的唯一访问实例。 */
export const taskDatabase = new TaskDatabase();
