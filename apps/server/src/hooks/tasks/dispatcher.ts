import { spawn } from 'node:child_process';
import { hostname } from 'node:os';

import { logger } from '@/configs/index.js';
import { uuidv7 } from '@/utils/index.js';
import { findFileByNameSync } from '@repo/utils-node';
import { TaskDatabase, taskDatabase } from './database.js';
import { TaskEvents } from './events.js';

import type { ChildProcess } from 'node:child_process';
import type { TaskLogLevel } from '@repo/types';
import type {
  ClaimedTask,
  SettleTaskAttemptInput,
  SettleTaskAttemptResult,
  TaskAttemptOutcome,
  TaskWorkerInput,
  TaskWorkerResult,
} from './types.js';

/** 当前服务实例的执行资源配置；队列由数据库事件唤醒。 */
const TASK_DISPATCHER_CONFIG = {
  globalConcurrency: 4,
  recoveryBatchSize: 100,
  terminateGraceMs: 1_000,
  processMaxOldSpaceSizeMb: 4 * 1024,
} as const;

/** dev 使用 worker-entry.ts，build 使用 worker-entry.js。 */
const TASK_WORKER_ENTRY = findFileByNameSync(
  import.meta.dirname,
  'worker-entry',
);

/** TaskExecution 主动停止 Worker 时记录的原因。 */
type TaskExecutionStopReason = 'canceled' | 'timed_out' | 'lease_lost';

/** Worker 子进程退出码和终止信号。 */
interface TaskWorkerExit {
  /** 正常退出码。 */
  code: number | null;
  /** 信号终止时的信号名。 */
  signal: NodeJS.Signals | null;
}

/** TaskDispatcher 收敛 attempt 时使用的统一入口。 */
type TaskSettler = (
  input: SettleTaskAttemptInput,
) => Promise<SettleTaskAttemptResult>;

/**
 * 通过入队和进程事件管理任务并发、活动进程和到期恢复。
 */
export class TaskDispatcher {
  /** 当前服务进程的唯一 Dispatcher 标识。 */
  private readonly dispatcherId = `${hostname()}:${process.pid}:${uuidv7()}`;
  /** 当前实例已经领取并监督的任务。 */
  private readonly activeExecutions = new Map<string, TaskExecution>();
  /** 只为已存在的重试或执行截止时间创建单次唤醒。 */
  private wakeTimer: ReturnType<typeof setTimeout> | undefined;
  /** 服务停止后不再领取任务或处理数据库通知。 */
  private started = false;
  /** 合并运行期间收到的事件，避免丢失 drain 尚未结束时的新入队。 */
  private pending = false;
  /** 重连时检查全部活动进程，补上断线期间错过的取消通知。 */
  private readonly events = new TaskEvents(async (taskId) => {
    if (taskId) {
      const execution = this.activeExecutions.get(taskId);
      if (execution && !(await execution.isActive()))
        execution.stop('canceled');
    } else {
      for (const execution of this.activeExecutions.values()) {
        if (!(await execution.isActive())) execution.stop('canceled');
      }
    }
    this.notify();
  });
  /** 是否正在执行一轮任务领取。 */
  private draining = false;
  /** 是否正在执行一轮过期任务恢复。 */
  private recovering = false;

  /**
   * 创建统一任务 Dispatcher。
   *
   * @param database 任务持久化和状态迁移入口。
   */
  constructor(private readonly database: TaskDatabase = taskDatabase) {}

  /** 启动数据库事件订阅，并读取一次已持久化队列。 */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await this.events.start();
      this.notify();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  /** 关闭订阅、单次唤醒和本实例子进程，停止后不再领取队列。 */
  stop(): void {
    this.started = false;
    this.pending = false;
    clearTimeout(this.wakeTimer);
    this.wakeTimer = undefined;
    this.events.stop();
    for (const execution of this.activeExecutions.values())
      execution.stop('lease_lost');
  }

  /** 合并入队、取消、执行完成及截止时间事件，不做固定间隔轮询。 */
  notify(): void {
    if (!this.started) return;
    this.pending = true;
    queueMicrotask(() => {
      void this.dispatch().catch((error: unknown) => {
        logger.error(
          { event: 'task.dispatch_failed', err: error },
          '任务事件调度失败',
        );
        // 只在数据库操作失败后补一次尝试，避免最后一次通知因瞬时故障丢失。
        if (this.started) this.wakeAt(new Date(Date.now() + 2000));
      });
    });
  }

  /** 串行消费唤醒事件，结束后仅为实际存在的未来任务安排一次等待。 */
  private async dispatch(): Promise<void> {
    if (this.draining || !this.started) return;
    this.draining = true;
    try {
      let checkedAt = new Date();
      while (this.pending && this.started) {
        this.pending = false;
        await this.recover();
        checkedAt = new Date();
        await this.drain(checkedAt);
      }
      clearTimeout(this.wakeTimer);
      this.wakeTimer = undefined;
      const next = await this.database.nextTaskWakeAt(
        [...this.activeExecutions.keys()],
        checkedAt,
      );
      if (!next || !this.started) return;
      this.wakeAt(next);
    } finally {
      this.draining = false;
      if (this.pending) this.notify();
    }
  }

  /**
   * 替换单次等待；只用于已知任务截止时间或一次故障重试。
   * @param at 需要重新处理队列的绝对时间。
   */
  private wakeAt(at: Date): void {
    clearTimeout(this.wakeTimer);
    this.wakeTimer = setTimeout(
      () => {
        this.wakeTimer = undefined;
        this.notify();
      },
      Math.max(1, Math.min(at.getTime() - Date.now(), 2_147_483_647)),
    );
    this.wakeTimer.unref();
  }

  /**
   * 终止当前实例监督的任务子进程。
   *
   * 数据库 canceled 状态必须先提交；跨实例任务通过事务通知终止。
   *
   * @param taskId 已持久化取消的通用任务标识。
   * @returns 当前实例持有该任务时返回 true。
   */
  interrupt(taskId: string): boolean {
    const active = this.activeExecutions.get(taskId);
    if (!active) return false;
    active.stop('canceled');
    return true;
  }

  // 调度内部流程：领取候选、恢复过期任务并统一加载终态回调。

  /**
   * 在全局和分组并发空位内领取并启动任务。
   *
   * @param checkedAt 本轮候选和后续重试等待共用的时间界限。
   * @returns 本轮候选完成领取尝试后结束，不等待任务执行。
   */
  private async drain(checkedAt: Date): Promise<void> {
    const available =
      TASK_DISPATCHER_CONFIG.globalConcurrency - this.activeExecutions.size;
    if (available <= 0) return;
    const candidates = await this.database.listRunnableTaskCandidates(
      Math.max(available * 10, 20),
      checkedAt,
    );
    for (const candidate of candidates) {
      if (
        !this.started ||
        this.activeExecutions.size >= TASK_DISPATCHER_CONFIG.globalConcurrency
      ) {
        break;
      }
      let activeGroupCount = 0;
      for (const active of this.activeExecutions.values()) {
        if (active.groupName === candidate.groupName) activeGroupCount++;
      }
      if (activeGroupCount >= candidate.concurrency) continue;
      const claimed = await this.database.claimTask(
        candidate.taskId,
        this.dispatcherId,
      );
      if (!claimed) continue;
      if (!this.started) return;
      const execution = new TaskExecution(
        claimed,
        this.database,
        async (input) => await this.database.settleTaskAttempt(input),
        () => {
          this.activeExecutions.delete(claimed.taskId);
          this.notify();
        },
      );
      this.activeExecutions.set(claimed.taskId, execution);
      void execution.run().catch((error: unknown) => {
        logger.error(
          {
            event: 'task.supervision_failed',
            taskId: claimed.taskId,
            scriptPath: claimed.scriptPath,
            err: error,
          },
          '任务子进程监督失败',
        );
      });
    }
  }

  /**
   * 启动、事件唤醒或执行截止时恢复已过期的 running 任务。
   *
   * @returns 当前批次过期 attempt 完成中断收敛后结束。
   */
  private async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const expired = await this.database.listExpiredRunningTasks(
        TASK_DISPATCHER_CONFIG.recoveryBatchSize,
      );
      for (const row of expired) {
        if (this.activeExecutions.has(row.taskId)) continue;
        if (!row.attemptId || !row.leaseId) continue;
        await this.database.settleTaskAttempt({
          taskId: row.taskId,
          attemptId: row.attemptId,
          leaseId: row.leaseId,
          outcome: 'interrupted',
          errorCode: 'TASK_WORKER_LOST',
          errorMessage: '上一个 Worker 的执行租约已过期',
        });
      }
    } finally {
      this.recovering = false;
    }
  }
}

/**
 * 监督单个已领取任务的子进程、日志、超时和结果收敛。
 */
class TaskExecution {
  /** 已启动的 Node.js 子进程。 */
  private child: ChildProcess | undefined;
  /** Worker 通过 IPC 返回的任务定义执行结果。 */
  private workerResult: TaskWorkerResult | undefined;
  /** Dispatcher 主动终止 Worker 子进程的原因。 */
  private stopReason: TaskExecutionStopReason | undefined;
  /** SIGTERM 后强制 SIGKILL 的 timer。 */
  private killTimer: ReturnType<typeof setTimeout> | undefined;
  /** 单次执行超时 timer。 */
  private timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  /** stdout/stderr 按顺序落库的 Promise 链。 */
  private logQueue: Promise<void> = Promise.resolve();
  /** stdout 尚未遇到换行的尾部数据。 */
  private stdoutBuffer = '';
  /** stderr 尚未遇到换行的尾部数据。 */
  private stderrBuffer = '';

  /** 已领取任务的并发分组。 */
  get groupName(): string {
    return this.claimed.groupName;
  }

  /**
   * 创建单任务子进程监督对象。
   *
   * @param claimed 已领取任务和 attempt 快照。
   * @param database 任务持久化与 lease 入口。
   * @param settle Dispatcher 提供的统一状态收敛动作。
   * @param onComplete 内存状态清理和下一轮调度通知。
   */
  constructor(
    private readonly claimed: ClaimedTask,
    private readonly database: TaskDatabase,
    private readonly settle: TaskSettler,
    private readonly onComplete: () => void,
  ) {}

  /**
   * 启动并监督已领取任务直至子进程退出和状态收敛。
   *
   * @returns attempt 完成收敛和内存清理后结束。
   */
  async run(): Promise<void> {
    let settlementStarted = false;
    try {
      if (this.stopReason === 'canceled') return;
      this.child = this.spawnWorker();
      this.bindWorker();
      const exitPromise = this.waitForWorkerExit();
      if (!this.child.pid) {
        throw new Error('TASK_PROCESS_START_FAILED: 子进程没有 PID');
      }
      await this.database.setTaskProcessId(
        this.claimed.attemptId,
        this.child.pid,
      );
      await this.database.appendTaskLog({
        taskId: this.claimed.taskId,
        attempt: this.claimed.attempt,
        level: 'info',
        message: `任务子进程已启动，PID：${this.child.pid}`,
      });
      this.timeoutTimer = setTimeout(() => {
        void this.handleTimeout();
      }, this.claimed.timeoutMs);
      this.timeoutTimer.unref();
      const input: TaskWorkerInput = {
        taskId: this.claimed.taskId,
        scriptPath: this.claimed.scriptPath,
        attemptId: this.claimed.attemptId,
        attempt: this.claimed.attempt,
        leaseId: this.claimed.leaseId,
        data: this.claimed.data,
        checkpoint: this.claimed.checkpoint,
      };
      this.child.send({ type: 'start', input });
      const exit = await exitPromise;
      await this.stopTimers();
      this.flushLogs();
      await this.logQueue;
      settlementStarted = true;
      await this.settleWorkerExit(exit);
    } catch (error) {
      await this.stopTimers();
      this.flushLogs();
      await this.logQueue;
      if (settlementStarted) {
        logger.error(
          {
            event: 'task.settlement_failed',
            taskId: this.claimed.taskId,
            scriptPath: this.claimed.scriptPath,
            err: error,
          },
          '任务结果写入失败，将在执行截止时间恢复',
        );
        return;
      }
      if (this.stopReason) return;
      this.terminateWorker();
      let message = '任务子进程启动失败';
      if (error instanceof Error && error.message.trim()) {
        message = error.message.trim().slice(0, 1_000);
      }
      await this.settle({
        taskId: this.claimed.taskId,
        attemptId: this.claimed.attemptId,
        leaseId: this.claimed.leaseId,
        outcome: 'failed',
        errorCode: 'TASK_PROCESS_START_FAILED',
        errorMessage: message,
      });
    } finally {
      this.onComplete();
    }
  }

  /**
   * 记录停止原因并终止仍在运行的子进程。
   *
   * @param reason 取消、超时或 lease 丢失原因。
   * @returns 终止信号已经发送或无需发送后结束。
   */
  stop(reason: TaskExecutionStopReason): void {
    this.stopReason = reason;
    this.terminateWorker();
  }

  // 进程启动：创建子进程并绑定 IPC 与输出流。

  /**
   * 创建带 IPC 且不缓存完整输出的 Node.js 子进程。
   *
   * @returns 已启动的任务子进程对象。
   */
  private spawnWorker(): ChildProcess {
    const args = [
      `--max-old-space-size=${TASK_DISPATCHER_CONFIG.processMaxOldSpaceSizeMb}`,
    ];
    if (TASK_WORKER_ENTRY.endsWith('.ts')) {
      args.push('--import', 'tsx');
    }
    args.push(TASK_WORKER_ENTRY);
    return spawn(process.execPath, args, {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: process.env,
    });
  }

  /**
   * 绑定 IPC 结果和 stdout/stderr 流式日志。
   *
   * @returns 事件监听器建立完成后结束。
   */
  private bindWorker(): void {
    if (!this.child) return;
    this.child.on('message', (message: unknown) => {
      if (this.isWorkerResult(message)) this.workerResult = message;
    });
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.queueLogs('info', chunk);
    });
    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.queueLogs('error', chunk);
    });
  }

  /** 判断数据库是否仍允许当前执行，用于收到取消通知后终止子进程。 */
  async isActive(): Promise<boolean> {
    return await this.database.assertTaskLeaseActive(
      this.claimed.taskId,
      this.claimed.leaseId,
    );
  }

  // 运行守卫：单次超时与分级终止。

  /**
   * 处理单次执行超时并终止子进程。
   *
   * @returns 超时日志完成写入后结束。
   */
  private async handleTimeout(): Promise<void> {
    if (this.stopReason) return;
    this.stopReason = 'timed_out';
    this.terminateWorker();
    try {
      await this.database.appendTaskLog({
        taskId: this.claimed.taskId,
        attempt: this.claimed.attempt,
        level: 'error',
        message: `任务执行超过 ${this.claimed.timeoutMs}ms，正在终止子进程`,
      });
    } catch (error) {
      logger.warn(
        {
          event: 'task.timeout_log_failed',
          taskId: this.claimed.taskId,
          err: error,
        },
        '任务超时日志写入失败',
      );
    }
  }

  /**
   * 先发送 SIGTERM，宽限期后仍未退出则发送 SIGKILL。
   *
   * @returns 信号已经发送或无需发送后结束。
   */
  private terminateWorker(): void {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    if (this.killTimer) return;
    this.killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, TASK_DISPATCHER_CONFIG.terminateGraceMs);
    this.killTimer.unref();
  }

  /**
   * 清理本次执行的超时和强制退出等待。
   *
   * @returns 本次执行不再持有计时器后结束。
   */
  private async stopTimers(): Promise<void> {
    clearTimeout(this.timeoutTimer);
    clearTimeout(this.killTimer);
  }

  // 输出持久化：按流拆行，并保持同一任务内的写入顺序。

  /**
   * 将子进程输出拆行后按原顺序加入持久化队列。
   *
   * @param level stdout 使用 info，stderr 使用 error。
   * @param chunk 当前输出数据块。
   * @returns 日志写入已经进入串行队列后立即结束。
   */
  private queueLogs(level: TaskLogLevel, chunk: Buffer): void {
    let buffer = this.stdoutBuffer;
    if (level === 'error') buffer = this.stderrBuffer;
    const parts = `${buffer}${chunk.toString()}`.split(/\r?\n/u);
    const tail = parts.pop() ?? '';
    if (level === 'error') this.stderrBuffer = tail;
    else this.stdoutBuffer = tail;
    const messages = parts.map((line) => line.trim()).filter(Boolean);
    if (messages.length) this.queueLogMessages(level, messages);
  }

  /**
   * 把完整消息追加到当前任务串行日志队列。
   *
   * @param level 当前消息的日志级别。
   * @param messages 已按输出顺序拆分的消息。
   * @returns 消息进入写入队列后立即结束。
   */
  private queueLogMessages(level: TaskLogLevel, messages: string[]): void {
    this.logQueue = this.logQueue
      .then(async () => {
        for (const message of messages) {
          await this.database.appendTaskLog({
            taskId: this.claimed.taskId,
            attempt: this.claimed.attempt,
            level,
            message,
          });
        }
      })
      .catch((error: unknown) => {
        logger.warn(
          {
            event: 'task.process_log_failed',
            taskId: this.claimed.taskId,
            err: error,
          },
          '任务子进程输出持久化失败',
        );
      });
  }

  /**
   * 子进程退出后刷新 stdout/stderr 未换行的尾部消息。
   *
   * @returns 尾部消息进入写入队列后立即结束。
   */
  private flushLogs(): void {
    const stdout = this.stdoutBuffer.trim();
    const stderr = this.stderrBuffer.trim();
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    if (stdout) this.queueLogMessages('info', [stdout]);
    if (stderr) this.queueLogMessages('error', [stderr]);
  }

  // 退出收敛：等待 close，并把 IPC 或异常退出映射到 attempt 状态。

  /**
   * 等待子进程 close 或启动错误。
   *
   * @returns 子进程退出码和信号。
   */
  private async waitForWorkerExit(): Promise<TaskWorkerExit> {
    if (!this.child) {
      throw new Error('TASK_PROCESS_START_FAILED: 子进程尚未创建');
    }
    return await new Promise((resolve, reject) => {
      this.child?.once('error', reject);
      this.child?.once('close', (code, signal) => resolve({ code, signal }));
    });
  }

  /**
   * 根据停止原因、IPC 结果和退出码收敛当前 attempt。
   *
   * @param exit 子进程退出码和信号。
   * @returns 数据库状态收敛完成后结束。
   */
  private async settleWorkerExit(exit: TaskWorkerExit): Promise<void> {
    if (this.stopReason === 'canceled') return;
    if (this.stopReason === 'lease_lost') return;
    if (this.stopReason === 'timed_out') {
      await this.settle({
        taskId: this.claimed.taskId,
        attemptId: this.claimed.attemptId,
        leaseId: this.claimed.leaseId,
        outcome: 'timed_out',
        errorCode: 'TASK_TIMED_OUT',
        errorMessage: `任务执行超过 ${this.claimed.timeoutMs}ms`,
      });
      return;
    }
    if (this.workerResult?.success && exit.code === 0) {
      await this.settle({
        taskId: this.claimed.taskId,
        attemptId: this.claimed.attemptId,
        leaseId: this.claimed.leaseId,
        outcome: 'succeeded',
        result: this.workerResult.result,
      });
      return;
    }
    if (this.workerResult && !this.workerResult.success) {
      let outcome: TaskAttemptOutcome = 'failed';
      if (this.workerResult.errorCode === 'TASK_CANCELED') {
        outcome = 'interrupted';
      }
      await this.settle({
        taskId: this.claimed.taskId,
        attemptId: this.claimed.attemptId,
        leaseId: this.claimed.leaseId,
        outcome,
        errorCode: this.workerResult.errorCode,
        errorMessage: this.workerResult.errorMessage,
      });
      return;
    }
    let exitMessage = `任务子进程异常退出，退出码：${exit.code ?? 'unknown'}`;
    if (exit.signal) exitMessage = `任务子进程被信号 ${exit.signal} 终止`;
    await this.settle({
      taskId: this.claimed.taskId,
      attemptId: this.claimed.attemptId,
      leaseId: this.claimed.leaseId,
      outcome: 'failed',
      errorCode: 'TASK_PROCESS_EXITED',
      errorMessage: exitMessage,
    });
  }

  /**
   * 判断未知 IPC 消息是否为任务执行结果。
   *
   * @param value 子进程发送的未知值。
   * @returns 消息符合成功或失败结果协议时返回 true。
   */
  private isWorkerResult(value: unknown): value is TaskWorkerResult {
    if (!value || typeof value !== 'object') return false;
    if (!('type' in value) || value.type !== 'result') return false;
    if (!('success' in value) || typeof value.success !== 'boolean') {
      return false;
    }
    if (value.success) return 'result' in value;
    if (!('errorCode' in value) || typeof value.errorCode !== 'string') {
      return false;
    }
    return 'errorMessage' in value && typeof value.errorMessage === 'string';
  }
}

/** 通用任务模块唯一的主进程 Dispatcher 实例。 */
export const taskDispatcher = new TaskDispatcher();
