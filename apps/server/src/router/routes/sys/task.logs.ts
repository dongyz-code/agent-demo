import { sqlLogsById } from '@/hooks/task/index.js';
import { getTaskVisibility } from '@/router/task-visibility.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/logs',
  method: 'POST',
  permission: adminPermissionKey('actions.task.logs'),
  handler: async ({ body: { task_id }, __token }) => {
    return (await sqlLogsById(task_id, await getTaskVisibility(__token))) ?? [];
  },
});

export default api;
