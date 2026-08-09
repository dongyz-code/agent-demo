import { logger } from '@/configs/index.js';
import { loadTaskScript, normalizeTaskInput } from './runtime.js';
import {
  addTask,
  cancelTask,
  countTasksByStatus,
  getTask,
  getTaskScript,
  listTasks,
  readTaskLogs,
} from './store.js';

import type {
  TaskAddInput,
  TaskCancelOptions,
  TaskListOptions,
  TaskLogOptions,
  TaskScriptModule,
} from './types.js';

/** 业务模块唯一允许使用的通用任务 API。 */
class TaskApi {
  /**
   * 添加持久化后台任务并立即返回任务 ID。
   *
   * @param input 名称、脚本、数据和可选执行策略组成的完整对象。
   * @returns 新建任务标识。
   */
  async add<TData>(input: TaskAddInput<TData>): Promise<string> {
    const snapshot = normalizeTaskInput(input);
    const script = await loadTaskScript<TData>(snapshot.script);
    const taskId = await addTask(snapshot, script.onCreate);
    const { notifyTaskWorker } = await import('./worker.js');
    notifyTaskWorker();
    return taskId;
  }

  /**
   * 查询任务摘要和全部 attempt。
   *
   * @param taskId 通用任务标识。
   * @returns 任务不存在时返回 null。
   */
  get(taskId: string) {
    return getTask(taskId);
  }

  /**
   * 分页查询通用任务。
   *
   * @param options 过滤、分页和计数开关。
   * @returns 当前页与可选总数。
   */
  list(options: TaskListOptions = {}) {
    return listTasks(options);
  }

  /**
   * 查询完整结构化任务日志。
   *
   * @param taskId 通用任务标识。
   * @param options 可选 attempt 过滤。
   * @returns 按时间和日志标识排序的日志。
   */
  logs(taskId: string, options: TaskLogOptions = {}) {
    return readTaskLogs(taskId, options);
  }

  /**
   * 取消等待、重试中或运行中的任务。
   *
   * @param taskId 通用任务标识。
   * @param options 取消用户、稳定错误码和安全原因。
   * @returns 实际从活动状态取消时返回 true。
   */
  async cancel(
    taskId: string,
    options: TaskCancelOptions = {},
  ): Promise<boolean> {
    const scriptUrl = await getTaskScript(taskId);
    let onCancel: TaskScriptModule['onCancel'];
    if (scriptUrl) {
      try {
        const script = await loadTaskScript(scriptUrl);
        onCancel = script.onCancel;
      } catch (error) {
        logger.warn(
          { event: 'task.cancel_script_load_failed', taskId, err: error },
          '任务脚本无法加载，将只取消通用任务状态',
        );
      }
    }
    const canceled = await cancelTask(taskId, options, onCancel);
    if (!canceled) return false;
    const { interruptTaskProcess } = await import('./worker.js');
    interruptTaskProcess(taskId);
    return true;
  }

  /**
   * 启动 stale 恢复和统一 Worker。
   *
   * @returns Worker 完成启动后结束。
   */
  async start(): Promise<void> {
    const { startTaskWorker } = await import('./worker.js');
    await startTaskWorker();
  }

  /**
   * 按过滤条件统计各任务状态数量。
   *
   * @param filter 与 list 共用的过滤条件。
   * @returns 状态及对应数量。
   */
  counts(filter: TaskListOptions['filter'] = {}) {
    return countTasksByStatus(filter);
  }
}

/** 通用任务模块唯一公共实例。 */
export const task = new TaskApi();

export type {
  TaskAddInput,
  TaskCancelLifecycleInput,
  TaskCancelOptions,
  TaskCreateInput,
  TaskFailureInput,
  TaskListOptions,
  TaskListResult,
  TaskLogOptions,
  TaskLogger,
  TaskProgressInput,
  TaskRetryInput,
  TaskRunInput,
  TaskScript,
  TaskScriptModule,
  TaskScriptTransaction,
} from './types.js';

export { TaskCanceledError } from './types.js';
