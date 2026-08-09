import {
  appendTaskRuntimeLog,
  assertTaskLeaseActive,
  updateTaskRuntimeProgress,
} from './store.js';
import { loadTaskScript } from './runtime.js';
import { TaskCanceledError } from './types.js';

import type {
  TaskProcessInput,
  TaskProcessResult,
  TaskProgressInput,
  TaskRunInput,
} from './types.js';
import type { TaskLogLevel } from '@repo/types';

/** 父 Worker 通过 IPC 发送的单次启动命令。 */
interface TaskProcessStartMessage {
  /** 消息类型。 */
  type: 'start';
  /** 已领取任务的完整子进程输入。 */
  input: TaskProcessInput;
}

let processCompleted = false;

process.once('message', (message: unknown) => {
  void handleStartMessage(message);
});
process.once('disconnect', () => {
  if (!processCompleted) process.exit(1);
});

/**
 * 校验父进程命令，执行任务脚本并在 IPC 刷新后退出。
 *
 * @param message 父进程发送的未知 IPC 消息。
 * @returns 结果发送完成后结束当前任务子进程。
 */
async function handleStartMessage(message: unknown): Promise<void> {
  let result: TaskProcessResult;
  if (!isTaskProcessStartMessage(message)) {
    result = {
      type: 'result',
      success: false,
      errorCode: 'TASK_PROCESS_INPUT_INVALID',
      errorMessage: '任务子进程启动参数无效',
    };
  } else {
    result = await runTask(message.input);
  }
  await sendResult(result);
  processCompleted = true;
  process.exit(result.success ? 0 : 1);
}

/**
 * 动态导入脚本并执行一个已领取任务。
 *
 * @param input 父 Worker 发送的任务、attempt、lease、script 和 data。
 * @returns 可安全通过 IPC 返回的成功结果或错误摘要。
 */
async function runTask(input: TaskProcessInput): Promise<TaskProcessResult> {
  try {
    const script = await loadTaskScript(input.script);
    const runInput = createTaskRunInput(input);
    await runInput.throwIfCanceled();
    const result = await script.default(runInput);
    await runInput.throwIfCanceled();
    return {
      type: 'result',
      success: true,
      result: normalizeTaskResult(result),
    };
  } catch (error) {
    return {
      type: 'result',
      success: false,
      errorCode: readErrorCode(error),
      errorMessage: readErrorMessage(error),
    };
  }
}

/**
 * 为任务脚本创建受当前 lease 保护的单对象运行参数。
 *
 * @param input 当前任务、attempt、lease 和业务数据。
 * @returns 只暴露 data、日志、进度和取消检查的运行参数。
 */
function createTaskRunInput(input: TaskProcessInput): TaskRunInput {
  return {
    taskId: input.taskId,
    attempt: input.attempt,
    data: input.data,
    log: {
      info: async (message) => await writeContextLog(input, 'info', message),
      debug: async (message) => await writeContextLog(input, 'debug', message),
      error: async (message) => await writeContextLog(input, 'error', message),
    },
    progress: async (progress) => await updateContextProgress(input, progress),
    throwIfCanceled: async () => {
      if (await assertTaskLeaseActive(input.taskId, input.leaseId)) return;
      throw new TaskCanceledError();
    },
  };
}

/**
 * 校验日志并关联当前 attempt 持久化。
 *
 * @param input 当前子进程任务输入。
 * @param level 日志级别。
 * @param message 已脱敏业务消息。
 * @returns 日志写入完成后结束，lease 失效时抛出取消异常。
 */
async function writeContextLog(
  input: TaskProcessInput,
  level: TaskLogLevel,
  message: string,
): Promise<void> {
  const normalized = message.trim();
  if (!normalized) return;
  const appended = await appendTaskRuntimeLog({
    taskId: input.taskId,
    leaseId: input.leaseId,
    attempt: input.attempt,
    level,
    message: normalized,
  });
  if (!appended) throw new TaskCanceledError();
}

/**
 * 校验公共进度输入并使用当前 lease 更新任务。
 *
 * @param input 当前子进程任务输入。
 * @param progress 任务脚本报告的阶段、进度和数量。
 * @returns 更新成功后结束，lease 失效时抛出取消异常。
 */
async function updateContextProgress(
  input: TaskProcessInput,
  progress: TaskProgressInput,
): Promise<void> {
  if (
    !Number.isInteger(progress.progress) ||
    progress.progress < 0 ||
    progress.progress > 100
  ) {
    throw new Error('TASK_PROGRESS_INVALID: progress 必须是 0 到 100 的整数');
  }
  const updated = await updateTaskRuntimeProgress({
    taskId: input.taskId,
    leaseId: input.leaseId,
    ...progress,
  });
  if (!updated) throw new TaskCanceledError();
}

/**
 * 把任务脚本返回值收敛为 IPC 与 PostgreSQL JSONB 都能保存的数据。
 *
 * @param result 任务脚本返回的未知值。
 * @returns JSON 可序列化副本；undefined 统一转换为 null。
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
 * 从未知异常读取稳定错误码。
 *
 * @param error 任务脚本抛出的未知值。
 * @returns Error 上的非空 code，缺失时返回 TASK_SCRIPT_FAILED。
 */
function readErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code).trim();
    if (code) return code.slice(0, 255);
  }
  if (error instanceof TaskCanceledError) return 'TASK_CANCELED';
  return 'TASK_SCRIPT_FAILED';
}

/**
 * 从未知异常读取不包含堆栈的安全摘要。
 *
 * @param error 任务脚本抛出的未知值。
 * @returns 最多 1,000 字符的错误消息。
 */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 1_000);
  }
  return '任务脚本执行失败';
}

/**
 * 判断未知 IPC 消息是否包含任务启动输入。
 *
 * @param value 父进程发送的未知值。
 * @returns 具有 start 类型和对象 input 时返回 true。
 */
function isTaskProcessStartMessage(
  value: unknown,
): value is TaskProcessStartMessage {
  if (!value || typeof value !== 'object') return false;
  if (!('type' in value) || value.type !== 'start') return false;
  return 'input' in value && Boolean(value.input) && typeof value.input === 'object';
}

/**
 * 等待 IPC 结果刷新，父进程通道缺失时直接结束。
 *
 * @param result 任务脚本的安全执行结果。
 * @returns IPC callback 触发或通道缺失后结束。
 */
async function sendResult(result: TaskProcessResult): Promise<void> {
  if (!process.send || !process.connected) return;
  await new Promise<void>((resolve) => {
    process.send?.(result, () => resolve());
  });
}
