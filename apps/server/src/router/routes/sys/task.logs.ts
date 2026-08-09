import { task } from '@/hooks/tasks/task.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/logs',
  method: 'POST',
  permission: adminPermissionKey('actions.task.logs'),
  handler: async ({ body }) =>
    await task.logs(body.task_id, { attempt: body.attempt }),
});

export default api;
