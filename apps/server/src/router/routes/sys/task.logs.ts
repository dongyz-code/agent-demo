import { tasksRun } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/task/logs',
  method: 'POST',
  handler: async ({ body: { task_id } }) => {
    return (await tasksRun.sqlLogsById(task_id)) ?? [];
  },
});

export default api;
