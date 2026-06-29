import { routerHandler } from '@/router/utils.js';
import { ROOT_SCHEDULE } from '@/configs/index.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/schedule-list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({}) => {
    const enable = ROOT_SCHEDULE.get().map((x) => x.name);
    return ROOT_SCHEDULE.list.map(({ name, cron }) => ({
      name,
      cron,
      status: enable.includes(name),
    }));
  },
});

export default api;
