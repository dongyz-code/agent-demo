import { ROOT_SCHEDULE } from '@/configs/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/schedule-resume',
  method: 'POST',
  permission: adminPermissionKey('actions.task.schedule'),
  handler: async ({ body: { name } }) => {
    ROOT_SCHEDULE.resume(name);
    return 'ok';
  },
});

export default api;
