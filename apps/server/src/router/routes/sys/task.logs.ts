import { db, schemas } from '@/database/index.js';
import { routerHandler } from '@/router/utils.js';
import { eq } from 'drizzle-orm';
import { adminPermissionKey } from '@repo/shared/permission';
import { NdGz } from '@repo/utils-node';

const ndGz = new NdGz();

const { api } = routerHandler({
  url: '/sys/task/logs',
  method: 'POST',
  permission: adminPermissionKey('actions.task.logs'),
  handler: async ({ body: { task_id } }) => {
    const [item] = await db
      .select({ logs: schemas.tasks.logs })
      .from(schemas.tasks)
      .where(eq(schemas.tasks.task_id, task_id))
      .limit(1);
    return item?.logs
      ? await ndGz.gzBufferToArr<string>({ buffer: item.logs })
      : [];
  },
});

export default api;
