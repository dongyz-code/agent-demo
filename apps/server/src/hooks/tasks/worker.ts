import { spawn } from 'node:child_process';
import { hostname } from 'node:os';

import { logger } from '@/configs/index.js';
import { uuidv7 } from '@/utils/index.js';
import { findFileByNameSync } from '@repo/utils-node';
import {
  hasTaskNameCapacity,
  loadTaskScript,
} from './runtime.js';
import {
  appendTaskLog,
  claimTask,
  listExpiredRunningTasks,
  listRunnableTaskCandidates,
  renewTaskLease,
  setTaskProcessId,
  settleTaskAttempt,
} from './store.js';

import type { ChildProcess } from 'node:child_process';
import type { ClaimedTask } from './store.js';
import type {
  SettleTaskAttemptInput,
  SettleTaskAttemptResult,
} from './store.js';
import type {
  TaskAttemptOutcome,
  TaskProcessInput,
  TaskProcessResult,
  TaskScriptModule,
} from './types.js';
import type { TaskLogLevel } from '@repo/types';

/** 当前服务进程的唯一 Worker 标识。 */
const WORKER_ID = `${hostname()}:${process.pid}:${uuidv7()}`;
/** 当前服务实例的 Worker 资源与轮询配置。 */
const taskWorkerConfig = {
  globalConcurrency: 4,
  pollIntervalMs: 2_000,
  heartbeatIntervalMs: 2_000,
  leaseDurationMs: 15_000,
  recoveryIntervalMs: 10_000,
  recoveryBatchSize: 100,
  terminateGraceMs: 1_000,
  processMaxOldSpaceSizeMb: 4 * 1024,
} as const;
/** dev 使用 process-entry.ts，build 使用 process-entry.js。 */
const TASK_PROCESS_ENTRY = findFileByNameSync(
  import.meta.dirname,
  'process-entry',
);
/** 当前实例已经领取并监督的任务。 */
const activeTasks = new Map<string, ActiveTask>();

let pollTimer: ReturnType<typeof setInterval> | undefined;
let recoveryTimer: ReturnType<typeof setInterval> | undefined;
let draining = false;
let recovering = false;

/** 父 Worker 监督单个任务子进程的内存状态。 */
interface ActiveTask {
  /** 已领取任务和 attempt 快照。 */
  claimed: ClaimedTask;
  /** 已启动的 Node.js 子进程。 */
  child?: ChildProcess;
  /** 任务脚本通过 IPC 返回的结果。 */
  result?: TaskProcessResult;
  /** 父 Worker 主动终止子进程的原因。 */
  stopReason?: 'canceled' | 'timed_out' | 'lease_lost';
  /** SIGTERM 后强制 SIGKILL 的 timer。 */
  killTimer?: ReturnType<typeof setTimeout>;
  /** 单次执行超时 timer。 */
  timeoutTimer?: ReturnType<typeof setTimeout>;
  /** heartbeat timer。 */
  heartbeatTimer?: ReturnType<typeof setInterval>;
  /** 当前正在执行的 heartbeat。 */
  heartbeatInFlight?: Promise<void>;
  /** stdout/stderr 按顺序落库的 Promise 链。 */
  logQueue: Promise<void>;
  /** stdout 尚未遇到换行的尾部数据。 */
  stdoutBuffer: string;
  /** stderr 尚未遇到换行的尾部数据。 */
  stderrBuffer: string;
}

/**
 * 启动统一 Worker、启动恢复和周期调度。
 *
 * @returns Worker timer 建立完成后结束。
 */
export async function startTaskWorker(): Promise<void> {
  if (pollTimer) return;
  await recoverStaleTasks();
  pollTimer = setInterval(notifyTaskWorker, taskWorkerConfig.pollIntervalMs);
  pollTimer.unref();
  recoveryTimer = setInterval(() => {
    void recoverStaleTasks().catch(logRecoveryError);
  }, taskWorkerConfig.recoveryIntervalMs);
  recoveryTimer.unref();
  notifyTaskWorker();
}

/**
 * 通知当前实例尽快执行一轮调度。
 *
 * @returns 调度进入微任务队列后立即结束。
 */
export function notifyTaskWorker(): void {
  if (!pollTimer) return;
  queueMicrotask(() => {
    void drainTasks().catch((error) => {
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
export function interruptTaskProcess(taskId: string): boolean {
  const active = activeTasks.get(taskId);
  if (!active) return false;
  active.stopReason = 'canceled';
  terminateTaskProcess(active);
  return true;
}

/**
 * 在全局和类型并发空位内领取并启动任务。
 *
 * @returns 本轮候选完成领取尝试后结束，不等待任务执行。
 */
async function drainTasks(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const available = taskWorkerConfig.globalConcurrency - activeTasks.size;
    if (available <= 0) return;
    const candidates = await listRunnableTaskCandidates(
      Math.max(available * 10, 20),
    );
    for (const candidate of candidates) {
      if (activeTasks.size >= taskWorkerConfig.globalConcurrency) break;
      if (!hasNameCapacity(candidate.name, candidate.concurrency)) continue;
      const claimed = await claimTask(
        candidate.taskId,
        WORKER_ID,
        taskWorkerConfig.leaseDurationMs,
      );
      if (!claimed) continue;
      const active: ActiveTask = {
        claimed,
        logQueue: Promise.resolve(),
        stdoutBuffer: '',
        stderrBuffer: '',
      };
      activeTasks.set(claimed.taskId, active);
      void superviseClaimedTask(active).catch((error) => {
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
    draining = false;
  }
}

/**
 * 判断当前实例是否仍有指定名称任务的并发空位。
 *
 * @param name 待调度任务名称。
 * @param concurrency 任务保存的单实例并发上限。
 * @returns 活动同名任务数量小于上限时返回 true。
 */
export function hasNameCapacity(
  name: string,
  concurrency: number,
): boolean {
  const activeNames = [...activeTasks.values()].map(
    (active) => active.claimed.name,
  );
  return hasTaskNameCapacity(name, concurrency, activeNames);
}

/**
 * 启动并监督已领取任务直至子进程退出和状态收敛。
 *
 * @param active 当前任务的父进程监督状态。
 * @returns attempt 完成收敛和内存清理后结束。
 */
async function superviseClaimedTask(active: ActiveTask): Promise<void> {
  const { claimed } = active;
  let reachedSettlement = false;
  try {
    if (active.stopReason === 'canceled') return;
    const child = spawnTaskProcess();
    active.child = child;
    bindTaskProcess(active);
    if (!child.pid) {
      throw new Error('TASK_PROCESS_START_FAILED: 子进程没有 PID');
    }
    await setTaskProcessId(claimed.attemptId, child.pid);
    await appendTaskLog({
      taskId: claimed.taskId,
      attempt: claimed.attempt,
      level: 'info',
      message: `任务子进程已启动，PID：${child.pid}`,
    });
    startTaskHeartbeat(active);
    active.timeoutTimer = setTimeout(() => {
      void handleTaskTimeout(active);
    }, claimed.timeoutMs);
    active.timeoutTimer.unref();
    child.send({
      type: 'start',
      input: toTaskProcessInput(claimed),
    });
    const exit = await waitForChildExit(child);
    await stopTaskTimers(active);
    flushProcessLogs(active);
    await active.logQueue;
    reachedSettlement = true;
    await settleExitedTask(active, exit);
  } catch (error) {
    await stopTaskTimers(active);
    flushProcessLogs(active);
    await active.logQueue;
    if (reachedSettlement) {
      logger.error(
        {
          event: 'task.settlement_failed',
          taskId: claimed.taskId,
          taskName: claimed.name,
          err: error,
        },
        '任务结果收敛失败，将由过期 lease 恢复流程处理',
      );
      return;
    }
    if (active.stopReason) return;
    terminateTaskProcess(active);
    const message = readUnknownError(error);
    await settleTaskWithScript(claimed.script, {
      taskId: claimed.taskId,
      attemptId: claimed.attemptId,
      leaseId: claimed.leaseId,
      outcome: 'failed',
      errorCode: 'TASK_PROCESS_START_FAILED',
      errorMessage: message,
    });
  } finally {
    activeTasks.delete(claimed.taskId);
    notifyTaskWorker();
  }
}

/**
 * 创建不缓存 stdout/stderr 的 Node.js 任务子进程。
 *
 * @returns 带 IPC 通道的子进程。
 */
function spawnTaskProcess(): ChildProcess {
  const args = [
    `--max-old-space-size=${taskWorkerConfig.processMaxOldSpaceSizeMb}`,
  ];
  if (TASK_PROCESS_ENTRY.endsWith('.ts')) {
    args.push('--import', 'tsx');
  }
  args.push(TASK_PROCESS_ENTRY);
  return spawn(process.execPath, args, {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: process.env,
  });
}

/**
 * 绑定 IPC 结果与 stdout/stderr 流式日志。
 *
 * @param active 当前任务监督状态。
 * @returns 事件绑定完成后结束。
 */
function bindTaskProcess(active: ActiveTask): void {
  const child = active.child;
  if (!child) return;
  child.on('message', (message: unknown) => {
    if (isTaskProcessResult(message)) active.result = message;
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    queueProcessLogs(active, 'info', chunk);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    queueProcessLogs(active, 'error', chunk);
  });
}

/**
 * 将子进程输出拆行后按原顺序持久化，不在父进程保留完整日志数组。
 *
 * @param active 当前任务监督状态。
 * @param level stdout 使用 info，stderr 使用 error。
 * @param chunk 当前输出数据块。
 * @returns 日志写入已经加入串行队列后立即结束。
 */
function queueProcessLogs(
  active: ActiveTask,
  level: TaskLogLevel,
  chunk: Buffer,
): void {
  const bufferKey = level === 'info' ? 'stdoutBuffer' : 'stderrBuffer';
  const parts = `${active[bufferKey]}${chunk.toString()}`
    .split(/\r?\n/u);
  active[bufferKey] = parts.pop() ?? '';
  const lines = parts.map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return;
  queueProcessLogMessages(active, level, lines);
}

/**
 * 将完整子进程日志消息追加到当前任务串行写入队列。
 *
 * @param active 当前任务监督状态。
 * @param level stdout 使用 info，stderr 使用 error。
 * @param messages 已按输出顺序拆分的完整消息。
 * @returns 消息进入写入队列后立即结束。
 */
function queueProcessLogMessages(
  active: ActiveTask,
  level: TaskLogLevel,
  messages: string[],
): void {
  active.logQueue = active.logQueue
    .then(async () => {
      for (const message of messages) {
        await appendTaskLog({
          taskId: active.claimed.taskId,
          attempt: active.claimed.attempt,
          level,
          message,
        });
      }
    })
    .catch((error) => {
      logger.warn(
        {
          event: 'task.process_log_failed',
          taskId: active.claimed.taskId,
          err: error,
        },
        '任务子进程输出持久化失败',
      );
    });
}

/**
 * 子进程退出后刷新 stdout/stderr 未换行的尾部消息。
 *
 * @param active 当前任务监督状态。
 * @returns 尾部消息进入写入队列后立即结束。
 */
function flushProcessLogs(active: ActiveTask): void {
  const stdout = active.stdoutBuffer.trim();
  const stderr = active.stderrBuffer.trim();
  active.stdoutBuffer = '';
  active.stderrBuffer = '';
  if (stdout) queueProcessLogMessages(active, 'info', [stdout]);
  if (stderr) queueProcessLogMessages(active, 'error', [stderr]);
}

/**
 * 启动当前任务 heartbeat，续租失败时终止子进程。
 *
 * @param active 当前任务监督状态。
 * @returns timer 建立完成后结束。
 */
function startTaskHeartbeat(active: ActiveTask): void {
  active.heartbeatTimer = setInterval(() => {
    if (active.heartbeatInFlight) return;
    active.heartbeatInFlight = heartbeatOnce(active).finally(() => {
      active.heartbeatInFlight = undefined;
    });
  }, taskWorkerConfig.heartbeatIntervalMs);
  active.heartbeatTimer.unref();
}

/**
 * 执行一次续租，数据库状态变化或数据库错误时停止当前进程。
 *
 * @param active 当前任务监督状态。
 * @returns 续租或必要的终止请求完成后结束。
 */
async function heartbeatOnce(active: ActiveTask): Promise<void> {
  try {
    const renewed = await renewTaskLease(
      active.claimed.taskId,
      active.claimed.leaseId,
      taskWorkerConfig.leaseDurationMs,
    );
    if (renewed) return;
  } catch (error) {
    logger.error(
      {
        event: 'task.heartbeat_failed',
        taskId: active.claimed.taskId,
        err: error,
      },
      '任务续租失败，正在终止子进程',
    );
  }
  if (!active.stopReason) active.stopReason = 'lease_lost';
  terminateTaskProcess(active);
}

/**
 * 处理单次执行超时并终止子进程。
 *
 * @param active 当前任务监督状态。
 * @returns 超时日志完成写入后结束。
 */
async function handleTaskTimeout(active: ActiveTask): Promise<void> {
  if (active.stopReason) return;
  active.stopReason = 'timed_out';
  try {
    await appendTaskLog({
      taskId: active.claimed.taskId,
      attempt: active.claimed.attempt,
      level: 'error',
      message: `任务执行超过 ${active.claimed.timeoutMs}ms，正在终止子进程`,
    });
  } catch (error) {
    logger.warn(
      {
        event: 'task.timeout_log_failed',
        taskId: active.claimed.taskId,
        err: error,
      },
      '任务超时日志写入失败',
    );
  } finally {
    terminateTaskProcess(active);
  }
}

/**
 * 先发送 SIGTERM，宽限期后仍未退出则发送 SIGKILL。
 *
 * @param active 当前任务监督状态。
 * @returns 信号已经发送或无需发送后结束。
 */
function terminateTaskProcess(active: ActiveTask): void {
  const child = active.child;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (active.killTimer) return;
  active.killTimer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }, taskWorkerConfig.terminateGraceMs);
  active.killTimer.unref();
}

/**
 * 清理 timeout、heartbeat、kill timer 并等待当前续租结束。
 *
 * @param active 当前任务监督状态。
 * @returns 所有进行中的 heartbeat 完成后结束。
 */
async function stopTaskTimers(active: ActiveTask): Promise<void> {
  clearTimeout(active.timeoutTimer);
  clearTimeout(active.killTimer);
  clearInterval(active.heartbeatTimer);
  await active.heartbeatInFlight;
}

/** 子进程退出码和信号。 */
interface TaskProcessExit {
  /** 正常退出码。 */
  code: number | null;
  /** 信号终止时的信号名。 */
  signal: NodeJS.Signals | null;
}

/**
 * 等待子进程 close 或启动错误。
 *
 * @param child 已创建的任务子进程。
 * @returns 退出码和信号。
 */
async function waitForChildExit(child: ChildProcess): Promise<TaskProcessExit> {
  return await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
}

/**
 * 根据主动停止原因、IPC 结果和退出码收敛当前 attempt。
 *
 * @param active 当前任务监督状态。
 * @param exit 子进程退出码和信号。
 * @returns 数据库状态收敛完成后结束。
 */
async function settleExitedTask(
  active: ActiveTask,
  exit: TaskProcessExit,
): Promise<void> {
  const { claimed } = active;
  if (active.stopReason === 'canceled') return;
  if (active.stopReason === 'lease_lost') return;
  if (active.stopReason === 'timed_out') {
    await settleTaskWithScript(claimed.script, {
      taskId: claimed.taskId,
      attemptId: claimed.attemptId,
      leaseId: claimed.leaseId,
      outcome: 'timed_out',
      errorCode: 'TASK_TIMED_OUT',
      errorMessage: `任务执行超过 ${claimed.timeoutMs}ms`,
    });
    return;
  }
  if (active.result?.success && exit.code === 0) {
    await settleTaskWithScript(claimed.script, {
      taskId: claimed.taskId,
      attemptId: claimed.attemptId,
      leaseId: claimed.leaseId,
      outcome: 'succeeded',
      result: active.result.result,
    });
    return;
  }
  if (active.result && !active.result.success) {
    let outcome: TaskAttemptOutcome = 'failed';
    if (active.result.errorCode === 'TASK_CANCELED') {
      outcome = 'interrupted';
    }
    await settleTaskWithScript(claimed.script, {
      taskId: claimed.taskId,
      attemptId: claimed.attemptId,
      leaseId: claimed.leaseId,
      outcome,
      errorCode: active.result.errorCode,
      errorMessage: active.result.errorMessage,
    });
    return;
  }
  let exitMessage = `任务子进程异常退出，退出码：${exit.code ?? 'unknown'}`;
  if (exit.signal) exitMessage = `任务子进程被信号 ${exit.signal} 终止`;
  await settleTaskWithScript(claimed.script, {
    taskId: claimed.taskId,
    attemptId: claimed.attemptId,
    leaseId: claimed.leaseId,
    outcome: 'failed',
    errorCode: 'TASK_PROCESS_EXITED',
    errorMessage: exitMessage,
  });
}

/**
 * 在启动和运行期间恢复 lease 过期的 running 任务。
 *
 * @returns 当前批次过期 attempt 完成中断收敛后结束。
 */
async function recoverStaleTasks(): Promise<void> {
  if (recovering) return;
  recovering = true;
  try {
    const expired = await listExpiredRunningTasks(
      taskWorkerConfig.recoveryBatchSize,
    );
    for (const row of expired) {
      if (activeTasks.has(row.taskId)) continue;
      if (!row.attemptId || !row.leaseId) continue;
      await settleTaskWithScript(row.script, {
        taskId: row.taskId,
        attemptId: row.attemptId,
        leaseId: row.leaseId,
        outcome: 'interrupted',
        errorCode: 'TASK_WORKER_LOST',
        errorMessage: '上一个 Worker 的执行租约已过期',
      });
    }
  } finally {
    recovering = false;
  }
}

/**
 * 记录后台周期恢复异常。
 *
 * @param error 恢复流程抛出的未知异常。
 * @returns 日志记录完成后结束。
 */
function logRecoveryError(error: unknown): void {
  logger.error(
    { event: 'task.recovery_failed', err: error },
    '过期任务恢复失败',
  );
}

/**
 * 把领取快照转换为子进程公共输入。
 *
 * @param claimed 当前已领取任务。
 * @returns 不包含父进程策略和内部函数的可序列化数据。
 */
function toTaskProcessInput(claimed: ClaimedTask): TaskProcessInput {
  return {
    taskId: claimed.taskId,
    script: claimed.script,
    attemptId: claimed.attemptId,
    attempt: claimed.attempt,
    leaseId: claimed.leaseId,
    data: claimed.data,
  };
}

/**
 * 加载脚本最终失败生命周期并在同一状态事务内收敛 attempt。
 *
 * @param script 当前任务持久化的脚本 URL。
 * @param input 不含脚本生命周期函数的状态收敛输入。
 * @returns 状态收敛结果。
 */
async function settleTaskWithScript(
  script: string,
  input: Omit<SettleTaskAttemptInput, 'onTerminalFailure'>,
): Promise<SettleTaskAttemptResult> {
  let onTerminalFailure: TaskScriptModule['onTerminalFailure'];
  try {
    const module = await loadTaskScript(script);
    onTerminalFailure = module.onTerminalFailure;
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
  return await settleTaskAttempt({
    ...input,
    onTerminalFailure,
  });
}

/**
 * 校验子进程 IPC 结果形状。
 *
 * @param value 子进程发送的未知消息。
 * @returns 符合成功或失败结果协议时返回 true。
 */
function isTaskProcessResult(value: unknown): value is TaskProcessResult {
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

/**
 * 从未知异常读取不包含堆栈的消息。
 *
 * @param error 未知异常。
 * @returns 最多 1,000 字符的安全摘要。
 */
function readUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 1_000);
  }
  return '任务子进程启动失败';
}
