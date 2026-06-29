import { tasksRun } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/kill',
  method: 'POST',
  permission: adminPermissionKey('actions.task.kill'),
  handler: async ({ body }) => {
    await tasksRun.kill(body.task_id);
    return 'ok';
  },
});

export default api;
