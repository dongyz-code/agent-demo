import { tasksRun } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/task/list',
  method: 'POST',
  handler: async ({ body }) => {
    return await tasksRun.sqlList(body);
  },
});

export default api;
