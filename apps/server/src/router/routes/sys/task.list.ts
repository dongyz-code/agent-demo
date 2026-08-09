import { task } from '@/hooks/tasks/task.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body }) =>
    await task.list({
      filter: body.form,
      limit: body.limit,
      withCount: body.withCount,
    }),
});

export default api;
