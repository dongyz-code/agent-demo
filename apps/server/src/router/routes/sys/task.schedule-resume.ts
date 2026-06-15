import { ROOT_SCHEDULE } from '@/configs/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/task/schedule-resume',
  method: 'POST',
  handler: async ({ body: { name } }) => {
    ROOT_SCHEDULE.resume(name);
    return 'ok';
  },
});

export default api;
