import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TaskAttemptStatus, TaskStatus } from '@repo/types';
import type {
  TaskAddInput,
  TaskAttemptOutcome,
  TaskScriptModule,
  TaskSnapshot,
} from './types.js';

/** 未显式配置时使用的任务执行策略。 */
const DEFAULT_TASK_POLICY = {
  concurrency: 4,
  maxRetries: 0,
  retryDelayMs: 5_000,
  timeoutMs: 30 * 60 * 1000,
} as const;

/** 当前运行环境允许加载业务脚本的服务端根目录。 */
const SERVER_SCRIPT_ROOT = resolve(import.meta.dirname, '../..');

/** 状态机对一次 attempt 的确定性收敛决定。 */
export interface TaskSettlementDecision {
  /** attempt 应写入的最终状态。 */
  attemptStatus: Extract<
    TaskAttemptStatus,
    'succeeded' | 'failed' | 'timed_out' | 'interrupted'
  >;
  /** 任务本轮完成后的状态。 */
  taskStatus: Extract<
    TaskStatus,
    'retrying' | 'succeeded' | 'failed' | 'timed_out'
  >;
  /** retrying 状态的下次可领取时间。 */
  nextRunAt: Date | null;
}

/**
 * 校验单对象 add 参数并补齐持久化策略快照。
 *
 * @param input 业务代码传入的完整任务对象。
 * @returns 可直接写入任务表的规范化快照。
 */
export function normalizeTaskInput<TData>(
  input: TaskAddInput<TData>,
): TaskSnapshot<TData> {
  const name = input.name.trim();
  if (!name) throw new Error('TASK_NAME_REQUIRED: 任务名称不能为空');
  if (name.length > 255) {
    throw new Error('TASK_NAME_INVALID: 任务名称不能超过 255 个字符');
  }
  const retry = input.retry;
  return {
    name,
    script: normalizeTaskScript(input.script),
    data: normalizeTaskData(input.data),
    concurrency: readPositiveInteger(
      input.concurrency,
      DEFAULT_TASK_POLICY.concurrency,
      'concurrency',
    ),
    maxRetries: readNonNegativeInteger(
      retry?.times,
      DEFAULT_TASK_POLICY.maxRetries,
      'retry.times',
    ),
    retryDelayMs: readNonNegativeInteger(
      retry?.delay,
      DEFAULT_TASK_POLICY.retryDelayMs,
      'retry.delay',
    ),
    timeoutMs: readPositiveInteger(
      input.timeout,
      DEFAULT_TASK_POLICY.timeoutMs,
      'timeout',
    ),
  };
}

/**
 * 动态导入并校验任务脚本模块约定。
 *
 * @param script 已持久化或即将持久化的服务端模块 URL。
 * @returns 包含默认执行函数和可选生命周期函数的模块。
 */
export async function loadTaskScript<TData>(
  script: string,
): Promise<TaskScriptModule<TData>> {
  const normalizedScript = normalizeTaskScript(script);
  const loaded = (await import(normalizedScript)) as Record<string, unknown>;
  if (typeof loaded.default !== 'function') {
    throw new Error('TASK_SCRIPT_INVALID: 任务脚本必须默认导出函数');
  }
  for (const hook of ['onCreate', 'onCancel', 'onTerminalFailure']) {
    if (loaded[hook] !== undefined && typeof loaded[hook] !== 'function') {
      throw new Error(`TASK_SCRIPT_INVALID: ${hook} 必须是函数`);
    }
  }
  return loaded as unknown as TaskScriptModule<TData>;
}

/**
 * 根据 attempt 结果和重试快照决定任务下一状态。
 *
 * @param input 当前结果、执行序号、策略快照和统一完成时间。
 * @returns attempt 状态、任务状态和可选下次执行时间。
 */
export function decideTaskSettlement(input: {
  /** 父 Worker 识别的单次执行结果。 */
  outcome: TaskAttemptOutcome;
  /** 当前从 1 开始的执行序号。 */
  attempt: number;
  /** 首次执行之外允许的最大重试次数。 */
  maxRetries: number;
  /** 固定重试间隔，单位毫秒。 */
  retryDelayMs: number;
  /** 当前 attempt 的统一完成时间。 */
  now: Date;
}): TaskSettlementDecision {
  if (input.outcome === 'succeeded') {
    return {
      attemptStatus: 'succeeded',
      taskStatus: 'succeeded',
      nextRunAt: null,
    };
  }
  const attemptStatus = mapAttemptOutcome(input.outcome);
  if (input.attempt <= input.maxRetries) {
    return {
      attemptStatus,
      taskStatus: 'retrying',
      nextRunAt: new Date(input.now.getTime() + input.retryDelayMs),
    };
  }
  let taskStatus: Extract<TaskStatus, 'failed' | 'timed_out'> = 'failed';
  if (input.outcome === 'timed_out') taskStatus = 'timed_out';
  return { attemptStatus, taskStatus, nextRunAt: null };
}

/**
 * 判断同名任务是否仍有当前实例并发空位。
 *
 * @param name 待调度任务名称。
 * @param concurrency 任务快照声明的单实例并发上限。
 * @param activeNames 当前实例正在监督的任务名称集合。
 * @returns 同名活动数量小于上限时返回 true。
 */
export function hasTaskNameCapacity(
  name: string,
  concurrency: number,
  activeNames: Iterable<string>,
): boolean {
  let activeCount = 0;
  for (const activeName of activeNames) {
    if (activeName === name) activeCount++;
  }
  return activeCount < concurrency;
}

/**
 * 规范化并限制任务脚本只能加载当前服务目录。
 *
 * @param script 调用方传入的模块 URL。
 * @returns 可持久化并供 import 使用的规范化 file URL。
 */
function normalizeTaskScript(script: string): string {
  const value = script.trim();
  if (!value) throw new Error('TASK_SCRIPT_REQUIRED: 任务脚本不能为空');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('TASK_SCRIPT_INVALID: 任务脚本必须是模块 URL');
  }
  if (url.protocol !== 'file:') {
    throw new Error('TASK_SCRIPT_INVALID: 任务脚本只允许使用 file URL');
  }
  const scriptPath = fileURLToPath(url);
  const relativePath = relative(SERVER_SCRIPT_ROOT, scriptPath);
  if (
    !relativePath ||
    relativePath.startsWith('..') ||
    isAbsolute(relativePath)
  ) {
    throw new Error('TASK_SCRIPT_INVALID: 任务脚本必须位于服务端目录内');
  }
  return url.href;
}

/**
 * 通过 JSON 往返拒绝函数、循环引用和 undefined 根值。
 *
 * @param data 业务传入的未知数据。
 * @returns 可安全交给 JSONB 驱动的数据副本。
 */
function normalizeTaskData<TData>(data: TData): TData {
  if (data === undefined) {
    throw new Error('TASK_DATA_INVALID: 任务数据不能是 undefined');
  }
  const serialized = JSON.stringify(data);
  if (serialized === undefined) {
    throw new Error('TASK_DATA_INVALID: 任务数据无法序列化');
  }
  return JSON.parse(serialized) as TData;
}

/**
 * 读取大于零的整数策略。
 *
 * @param value 业务配置值。
 * @param fallback 未提供时的缺省值。
 * @param field 错误消息中的字段名。
 * @returns 校验后的整数。
 */
function readPositiveInteger(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`TASK_POLICY_INVALID: ${field} 必须是大于零的整数`);
  }
  return resolved;
}

/**
 * 读取大于等于零的整数策略。
 *
 * @param value 业务配置值。
 * @param fallback 未提供时的缺省值。
 * @param field 错误消息中的字段名。
 * @returns 校验后的整数。
 */
function readNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(`TASK_POLICY_INVALID: ${field} 必须是非负整数`);
  }
  return resolved;
}

/**
 * 将父 Worker 结果映射为 attempt 最终状态。
 *
 * @param outcome 非成功执行结果。
 * @returns 对应的失败、超时或中断状态。
 */
function mapAttemptOutcome(
  outcome: Exclude<TaskAttemptOutcome, 'succeeded'>,
): Extract<TaskAttemptStatus, 'failed' | 'timed_out' | 'interrupted'> {
  if (outcome === 'timed_out') return 'timed_out';
  if (outcome === 'interrupted') return 'interrupted';
  return 'failed';
}
