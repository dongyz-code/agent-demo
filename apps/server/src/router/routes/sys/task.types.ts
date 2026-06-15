import { tasksRun } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';

const data = JSON.stringify({
  data: tasksRun.types(),
});

const { api } = routerHandler({
  url: '/sys/task/types',
  method: 'POST',
  handler: async ({}) => {
    return data as any;
  },
});

export default api;
