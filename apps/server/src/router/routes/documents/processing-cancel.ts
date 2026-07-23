import { and, eq, inArray } from 'drizzle-orm';

import { ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-cancel',
  method: 'POST',
  permission: adminPermissionKey('actions.task.kill'),
  handler: async ({ body }) => {
    const [task] = await db
      .select({ id: schema.file_processing_tasks.task_id })
      .from(schema.file_processing_tasks)
      .where(eq(schema.file_processing_tasks.task_id, body.taskId))
      .limit(1);
    if (!task) {
      throw new ROOT_ERROR(
        '相关文件不存在',
        'FILE_PROCESSING_TASK_NOT_FOUND: 文件处理任务不存在',
      );
    }
    const [updated] = await db
      .update(schema.tasks)
      .set({
        status: 'killed',
        end_timestamp: new Date(),
        last_update_timestamp: new Date(),
      })
      .where(
        and(
          eq(schema.tasks.task_id, body.taskId),
          inArray(schema.tasks.status, ['to-be-started', 'pending']),
        ),
      )
      .returning({ taskId: schema.tasks.task_id });
    if (!updated) {
      throw new ROOT_ERROR(
        '数据异常',
        'FILE_PROCESSING_TASK_STATE_CONFLICT: 只有等待或执行中的任务可以取消',
      );
    }
    return 'ok' as const;
  },
});

export default api;
