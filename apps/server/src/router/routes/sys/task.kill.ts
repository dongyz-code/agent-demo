import { tasksRun } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/task/kill',
  method: 'POST',
  handler: async ({ body }) => {
    await tasksRun.kill(body.task_id);
    return 'ok';
  },
});

export default api;
