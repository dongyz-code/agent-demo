import { tasksRun } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/task/counts',
  method: 'POST',
  handler: async ({ body }) => {
    return await tasksRun.sqlCounts(body.form);
  },
});

export default api;
