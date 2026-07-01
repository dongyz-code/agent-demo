import { listTableOperations } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/operation-list',
  method: 'POST',
  permission: adminPermissionKey('actions.table.view'),
  handler: async ({ body: { table, type, status, limit, withCount } }) => {
    return await listTableOperations({
      table,
      type,
      status,
      limit,
      withCount,
    });
  },
});

export default api;
