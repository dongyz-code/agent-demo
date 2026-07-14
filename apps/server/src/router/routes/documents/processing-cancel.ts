import { and, eq, inArray } from 'drizzle-orm';

import { createDomainError } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { getFileProcessingTask } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-cancel',
  method: 'POST',
  permission: adminPermissionKey('actions.task.kill'),
  handler: async ({ body }) => {
    await getFileProcessingTask(body.taskId);
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
      throw createDomainError(
        'FILE_PROCESSING_TASK_STATE_CONFLICT',
        '只有等待或执行中的任务可以取消',
        '数据异常',
      );
    }
    return 'ok' as const;
  },
});

export default api;
