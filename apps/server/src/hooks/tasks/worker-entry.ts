import { taskDatabase } from './database.js';
import { TaskCanceledError } from './types.js';

import type {
  TaskProgressInput,
  TaskRunInput,
  TaskScriptModule,
  TaskWorkerInput,
  TaskWorkerResult,
} from './types.js';
import type { TaskLogLevel } from '@repo/types';

/** 主进程通过 IPC 发送的单次启动命令。 */
interface TaskWorkerStartMessage {
  /** 消息类型。 */
  type: 'start';
  /** 已领取任务的完整子进程输入。 */
  input: TaskWorkerInput;
}

let workerCompleted = false;

process.once('message', (message: unknown) => {
  void handleStartMessage(message);
});
process.once('disconnect', () => {
  if (!workerCompleted) process.exit(1);
});

/**
 * 校验父进程命令，执行任务脚本并在 IPC 刷新后退出。
 *
 * @param message 父进程发送的未知 IPC 消息。
 * @returns 结果发送完成后结束当前任务子进程。
 */
async function handleStartMessage(message: unknown): Promise<void> {
  let result: TaskWorkerResult;
  if (!isTaskWorkerStartMessage(message)) {
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
  workerCompleted = true;
  process.exit(result.success ? 0 : 1);
}

/**
 * 动态导入脚本并执行一个已领取任务。
 *
 * @param input Dispatcher 发送的任务、attempt、lease、script 和 data。
 * @returns 可安全通过 IPC 返回的成功结果或错误摘要。
 */
async function runTask(input: TaskWorkerInput): Promise<TaskWorkerResult> {
  try {
    const script = (await import(input.script)) as TaskScriptModule;
    const runInput = createTaskRunInput(input);
    await runInput.throwIfCanceled();
    const scriptResult = await script.default(runInput);
    await runInput.throwIfCanceled();
    let result: unknown = null;
    if (scriptResult !== undefined) {
      const serialized = JSON.stringify(scriptResult);
      if (serialized === undefined) {
        throw new Error('TASK_RESULT_INVALID: 任务结果无法序列化');
      }
      result = JSON.parse(serialized) as unknown;
    }
    return {
      type: 'result',
      success: true,
      result,
    };
  } catch (error) {
    let errorCode = 'TASK_SCRIPT_FAILED';
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String(error.code).trim();
      if (code) errorCode = code.slice(0, 255);
    }
    if (
      errorCode === 'TASK_SCRIPT_FAILED' &&
      error instanceof TaskCanceledError
    ) {
      errorCode = 'TASK_CANCELED';
    }
    let errorMessage = '任务脚本执行失败';
    if (error instanceof Error && error.message.trim()) {
      errorMessage = error.message.trim().slice(0, 1_000);
    }
    return {
      type: 'result',
      success: false,
      errorCode,
      errorMessage,
    };
  }
}

/**
 * 为任务脚本创建受当前 lease 保护的单对象运行参数。
 *
 * @param input 当前任务、attempt、lease 和业务数据。
 * @returns 只暴露 data、日志、进度和取消检查的运行参数。
 */
function createTaskRunInput(input: TaskWorkerInput): TaskRunInput {
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
      if (
        await taskDatabase.assertTaskLeaseActive(input.taskId, input.leaseId)
      ) {
        return;
      }
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
  input: TaskWorkerInput,
  level: TaskLogLevel,
  message: string,
): Promise<void> {
  const logMessage = message.trim();
  if (!logMessage) return;
  const appended = await taskDatabase.appendTaskRuntimeLog({
    taskId: input.taskId,
    leaseId: input.leaseId,
    attempt: input.attempt,
    level,
    message: logMessage,
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
  input: TaskWorkerInput,
  progress: TaskProgressInput,
): Promise<void> {
  if (
    !Number.isInteger(progress.progress) ||
    progress.progress < 0 ||
    progress.progress > 100
  ) {
    throw new Error('TASK_PROGRESS_INVALID: progress 必须是 0 到 100 的整数');
  }
  const updated = await taskDatabase.updateTaskRuntimeProgress({
    taskId: input.taskId,
    leaseId: input.leaseId,
    ...progress,
  });
  if (!updated) throw new TaskCanceledError();
}

/**
 * 判断未知 IPC 消息是否包含任务启动输入。
 *
 * @param value 父进程发送的未知值。
 * @returns 具有 start 类型和对象 input 时返回 true。
 */
function isTaskWorkerStartMessage(
  value: unknown,
): value is TaskWorkerStartMessage {
  if (!value || typeof value !== 'object') return false;
  if (!('type' in value) || value.type !== 'start') return false;
  return (
    'input' in value && Boolean(value.input) && typeof value.input === 'object'
  );
}

/**
 * 等待 IPC 结果刷新，父进程通道缺失时直接结束。
 *
 * @param result 任务脚本的安全执行结果。
 * @returns IPC callback 触发或通道缺失后结束。
 */
async function sendResult(result: TaskWorkerResult): Promise<void> {
  if (!process.send || !process.connected) return;
  await new Promise<void>((resolve) => {
    process.send?.(result, () => resolve());
  });
}
