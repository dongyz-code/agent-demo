import { z } from 'zod';
import { defineTask } from '@/hooks/tasks/task.js';
import type { ScheduleHandlerInfo } from '@repo/types';
import type { TaskEnqueueOptions, TaskHandle } from '@/hooks/tasks/types.js';

/** 汇总导出定时任务业务方法；Worker 仍按各方法文件独立加载执行。 */
export { default as cleanupUploads } from './upload-cleanup.js';

/** 已注册处理器只暴露描述、参数校验与类型化入队句柄。 */
interface RegisteredHandler {
  /** 管理端可见的执行策略，不包含任意脚本入口。 */
  info: ScheduleHandlerInfo;
  /** 校验配置对象，不接收动态脚本或函数名。 */
  validate: (params: Record<string, unknown>) => void;
  /** 执行、重试与超时全部交给既有任务中心。 */
  task: TaskHandle<Record<string, unknown>>;
}
/** 上传清理策略同时用于实际执行与前端说明，避免两边漂移。 */
const cleanupPolicy = {
  timeoutMs: 300_000,
  retry: { times: 1, delayMs: 5_000 },
};
/** 汇总所有定时方法的注册信息；新增方法在本目录实现后于此登记。 */
const registry = new Map<string, RegisteredHandler>([
  [
    'upload.cleanup',
    {
      info: {
        key: 'upload.cleanup',
        label: '清理过期上传',
        description: '回收过期上传会话与临时文件，重复执行安全。',
        defaultParams: {},
        timeoutMs: cleanupPolicy.timeoutMs,
        retries: cleanupPolicy.retry.times,
      },
      validate: (params) => {
        if (!z.object({}).strict().safeParse(params).success)
          throw new Error('上传清理只接受空参数对象');
      },
      task: defineTask<Record<string, unknown>>({
        script: new URL('./upload-cleanup.js', import.meta.url),
        group: 'maintenance.upload',
        concurrency: 1,
        ...cleanupPolicy,
      }),
    },
  ],
]);
/** 发送给管理端的安全目录，不包含函数或脚本路径。 */
export const scheduleHandlers = [...registry.values()].map(
  (handler) => handler.info,
);

/**
 * 验证代码处理器和参数，拒绝客户端指定脚本。
 * @param key 稳定处理器标识。
 * @param params 可序列化业务参数。
 * @returns 已验证的描述。
 */
export function validateHandler(
  key: string,
  params: Record<string, unknown>,
): ScheduleHandlerInfo {
  const handler = registry.get(key);
  if (!handler) throw new Error('处理器不存在或已下线');
  handler.validate(params);
  return handler.info;
}

/**
 * 将安全参数交给既有任务中心，同事务创建任务与触发台账。
 * @param key 处理器标识。
 * @param params 业务参数。
 * @param options 入队审计及共享事务。
 * @returns 通用任务标识。
 */
export async function enqueueSchedule(
  key: string,
  params: Record<string, unknown>,
  options: TaskEnqueueOptions,
): Promise<string> {
  validateHandler(key, params);
  return await registry.get(key)!.task.enqueue(params, options);
}
