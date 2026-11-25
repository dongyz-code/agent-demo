import { upload } from '@/hooks/upload/index.js';
import type { TaskRunContext } from '@/hooks/tasks/types.js';

/**
 * 在任务子进程中清理过期上传；仅接受空参数，执行日志由任务中心持久化。
 * @param _data 空参数对象。
 * @param context 任务执行上下文。
 */
export default async function cleanupUploads(
  _data: Record<string, never>,
  context: TaskRunContext,
): Promise<void> {
  await context.throwIfCanceled();
  await context.log.info('开始回收过期上传会话与临时对象');
  await upload.cleanupExpired();
  await context.log.info('上传清理完成');
}
