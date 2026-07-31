import { eq } from 'drizzle-orm';

import { logger } from '@/configs/index.js';
import { db, schemas } from '@/database/index.js';
import { NdGz } from '@repo/utils-node';

const taskLogCodec = new NdGz();
const MAX_TASK_LOG_LINES = 2_000;

/**
 * 读取通用任务容器保存的日志行。
 *
 * @param taskId 通用任务标识。
 * @returns 按写入顺序排列的日志；任务不存在或尚无日志时返回空数组。
 */
export async function readTaskLogs(taskId: string): Promise<string[]> {
  const [task] = await db
    .select({ logs: schemas.tasks.logs })
    .from(schemas.tasks)
    .where(eq(schemas.tasks.task_id, taskId))
    .limit(1);
  if (!task?.logs) return [];
  return await taskLogCodec.gzBufferToArr<string>({ buffer: task.logs });
}

/**
 * 把安全日志追加到通用任务容器，日志失败不得影响任务本身。
 *
 * @param taskId 通用任务标识。
 * @param message 不包含敏感业务内容的日志文案。
 * @returns 日志写入完成或降级跳过后结束。
 */
export async function appendTaskLog(
  taskId: string,
  message: string,
): Promise<void> {
  try {
    const lines = await readTaskLogs(taskId);
    lines.push(`[${new Date().toISOString()}] ${message}`);
    const logs = await taskLogCodec.arrToNdGzBuffer({
      data: lines.slice(-MAX_TASK_LOG_LINES),
    });
    await db
      .update(schemas.tasks)
      .set({ logs })
      .where(eq(schemas.tasks.task_id, taskId));
  } catch (error) {
    logger.warn(
      { event: 'task.log_append_failed', taskId, err: error },
      '任务运行日志写入失败',
    );
  }
}
