import { tasksRun } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const data = JSON.stringify({
  data: tasksRun.types(),
});

const { api } = routerHandler({
  url: '/sys/task/types',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({}) => {
    return data as any;
  },
});

export default api;
