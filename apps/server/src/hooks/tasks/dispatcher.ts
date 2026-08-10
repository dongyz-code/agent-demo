import { spawn } from 'node:child_process';
import { hostname } from 'node:os';

import { logger } from '@/configs/index.js';
import { uuidv7 } from '@/utils/index.js';
import { findFileByNameSync } from '@repo/utils-node';
import { TaskDatabase, taskDatabase } from './database.js';

import type { ChildProcess } from 'node:child_process';
import type { TaskLogLevel } from '@repo/types';
import type {
  ClaimedTask,
  SettleTaskAttemptInput,
  SettleTaskAttemptResult,
  TaskAttemptOutcome,
  TaskScriptModule,
  TaskWorkerInput,
  TaskWorkerResult,
} from './types.js';

/** 当前服务实例的 Dispatcher 资源与轮询配置。 */
const TASK_DISPATCHER_CONFIG = {
  globalConcurrency: 4,
  pollIntervalMs: 2_000,
  heartbeatIntervalMs: 2_000,
  leaseDurationMs: 15_000,
  recoveryIntervalMs: 10_000,
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
  script: string,
  input: Omit<SettleTaskAttemptInput, 'onTerminalFailure'>,
) => Promise<SettleTaskAttemptResult>;

/**
 * 管理当前服务实例的任务轮询、并发、活动进程和失效恢复。
 */
export class TaskDispatcher {
  /** 当前服务进程的唯一 Dispatcher 标识。 */
  private readonly dispatcherId = `${hostname()}:${process.pid}:${uuidv7()}`;
  /** 当前实例已经领取并监督的任务。 */
  private readonly activeExecutions = new Map<string, TaskExecution>();
  /** 等待任务轮询 timer。 */
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  /** 过期 lease 恢复 timer。 */
  private recoveryTimer: ReturnType<typeof setInterval> | undefined;
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

  /**
   * 启动任务轮询、失效恢复并立即尝试领取任务。
   *
   * @returns Dispatcher 已经启动后结束。
   */
  async start(): Promise<void> {
    if (this.pollTimer) return;
    await this.recover();
    this.pollTimer = setInterval(
      () => this.notify(),
      TASK_DISPATCHER_CONFIG.pollIntervalMs,
    );
    this.pollTimer.unref();
    this.recoveryTimer = setInterval(() => {
      void this.recover().catch((error: unknown) => {
        logger.error(
          { event: 'task.recovery_failed', err: error },
          '过期任务恢复失败',
        );
      });
    }, TASK_DISPATCHER_CONFIG.recoveryIntervalMs);
    this.recoveryTimer.unref();
    this.notify();
  }

  /**
   * 通知当前实例尽快执行一轮调度。
   *
   * @returns 调度进入微任务队列后立即结束。
   */
  notify(): void {
    if (!this.pollTimer) return;
    queueMicrotask(() => {
      void this.drain().catch((error: unknown) => {
        logger.error(
          { event: 'task.worker_drain_failed', err: error },
          '任务调度失败',
        );
      });
    });
  }

  /**
   * 终止当前实例监督的任务子进程。
   *
   * 数据库 canceled 状态必须先提交；跨实例任务由 heartbeat 检测后终止。
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
   * 在全局和同名并发空位内领取并启动任务。
   *
   * @returns 本轮候选完成领取尝试后结束，不等待任务执行。
   */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const available =
        TASK_DISPATCHER_CONFIG.globalConcurrency - this.activeExecutions.size;
      if (available <= 0) return;
      const candidates = await this.database.listRunnableTaskCandidates(
        Math.max(available * 10, 20),
      );
      for (const candidate of candidates) {
        if (
          this.activeExecutions.size >= TASK_DISPATCHER_CONFIG.globalConcurrency
        ) {
          break;
        }
        let activeNameCount = 0;
        for (const active of this.activeExecutions.values()) {
          if (active.name === candidate.name) activeNameCount++;
        }
        if (activeNameCount >= candidate.concurrency) continue;
        const claimed = await this.database.claimTask(
          candidate.taskId,
          this.dispatcherId,
          TASK_DISPATCHER_CONFIG.leaseDurationMs,
        );
        if (!claimed) continue;
        const execution = new TaskExecution(
          claimed,
          this.database,
          async (script, input) =>
            await this.settleTaskWithScript(script, input),
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
              taskName: claimed.name,
              err: error,
            },
            '任务子进程监督失败',
          );
        });
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * 在启动和运行期间恢复 lease 过期的 running 任务。
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
        await this.settleTaskWithScript(row.script, {
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

  /**
   * 按需加载最终失败生命周期并收敛当前 attempt。
   *
   * @param script 当前任务持久化的内部模块 URL。
   * @param input 不含脚本生命周期函数的状态收敛输入。
   * @returns 状态收敛结果。
   */
  private async settleTaskWithScript(
    script: string,
    input: Omit<SettleTaskAttemptInput, 'onTerminalFailure'>,
  ): Promise<SettleTaskAttemptResult> {
    let onTerminalFailure: TaskScriptModule['onTerminalFailure'];
    try {
      const taskModule = (await import(script)) as TaskScriptModule;
      onTerminalFailure = taskModule.onTerminalFailure;
    } catch (error) {
      logger.warn(
        {
          event: 'task.settlement_script_load_failed',
          taskId: input.taskId,
          err: error,
        },
        '任务脚本无法加载，将只收敛通用任务状态',
      );
    }
    return await this.database.settleTaskAttempt({
      ...input,
      onTerminalFailure,
    });
  }
}

/**
 * 监督单个已领取任务的子进程、日志、heartbeat、超时和结果收敛。
 */
class TaskExecution {
  /** 已启动的 Node.js 子进程。 */
  private child: ChildProcess | undefined;
  /** 任务脚本通过 IPC 返回的结果。 */
  private workerResult: TaskWorkerResult | undefined;
  /** Dispatcher 主动终止 Worker 子进程的原因。 */
  private stopReason: TaskExecutionStopReason | undefined;
  /** SIGTERM 后强制 SIGKILL 的 timer。 */
  private killTimer: ReturnType<typeof setTimeout> | undefined;
  /** 单次执行超时 timer。 */
  private timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  /** heartbeat timer。 */
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  /** 当前正在执行的 heartbeat。 */
  private heartbeatInFlight: Promise<void> | undefined;
  /** stdout/stderr 按顺序落库的 Promise 链。 */
  private logQueue: Promise<void> = Promise.resolve();
  /** stdout 尚未遇到换行的尾部数据。 */
  private stdoutBuffer = '';
  /** stderr 尚未遇到换行的尾部数据。 */
  private stderrBuffer = '';

  /** 已领取任务的稳定名称。 */
  get name(): string {
    return this.claimed.name;
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
      this.startHeartbeat();
      this.timeoutTimer = setTimeout(() => {
        void this.handleTimeout();
      }, this.claimed.timeoutMs);
      this.timeoutTimer.unref();
      const input: TaskWorkerInput = {
        taskId: this.claimed.taskId,
        script: this.claimed.script,
        attemptId: this.claimed.attemptId,
        attempt: this.claimed.attempt,
        leaseId: this.claimed.leaseId,
        data: this.claimed.data,
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
            taskName: this.claimed.name,
            err: error,
          },
          '任务结果收敛失败，将由过期 lease 恢复流程处理',
        );
        return;
      }
      if (this.stopReason) return;
      this.terminateWorker();
      let message = '任务子进程启动失败';
      if (error instanceof Error && error.message.trim()) {
        message = error.message.trim().slice(0, 1_000);
      }
      await this.settle(this.claimed.script, {
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

  // 运行守卫：heartbeat、超时与分级终止。

  /**
   * 启动当前任务 heartbeat，续租失败时终止子进程。
   *
   * @returns timer 建立完成后结束。
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.heartbeatInFlight) return;
      this.heartbeatInFlight = this.heartbeat().finally(() => {
        this.heartbeatInFlight = undefined;
      });
    }, TASK_DISPATCHER_CONFIG.heartbeatIntervalMs);
    this.heartbeatTimer.unref();
  }

  /**
   * 执行一次续租，数据库状态变化或异常时终止子进程。
   *
   * @returns 续租或必要的终止请求完成后结束。
   */
  private async heartbeat(): Promise<void> {
    try {
      const renewed = await this.database.renewTaskLease(
        this.claimed.taskId,
        this.claimed.leaseId,
        TASK_DISPATCHER_CONFIG.leaseDurationMs,
      );
      if (renewed) return;
    } catch (error) {
      logger.error(
        {
          event: 'task.heartbeat_failed',
          taskId: this.claimed.taskId,
          err: error,
        },
        '任务续租失败，正在终止子进程',
      );
    }
    if (!this.stopReason) this.stopReason = 'lease_lost';
    this.terminateWorker();
  }

  /**
   * 处理单次执行超时并终止子进程。
   *
   * @returns 超时日志完成写入后结束。
   */
  private async handleTimeout(): Promise<void> {
    if (this.stopReason) return;
    this.stopReason = 'timed_out';
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
    } finally {
      this.terminateWorker();
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
   * 清理 timeout、heartbeat、kill timer 并等待正在执行的续租。
   *
   * @returns 所有进行中的 heartbeat 完成后结束。
   */
  private async stopTimers(): Promise<void> {
    clearTimeout(this.timeoutTimer);
    clearTimeout(this.killTimer);
    clearInterval(this.heartbeatTimer);
    await this.heartbeatInFlight;
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
      await this.settle(this.claimed.script, {
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
      await this.settle(this.claimed.script, {
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
      await this.settle(this.claimed.script, {
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
    await this.settle(this.claimed.script, {
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
