import { getVisibleTableDetail } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/detail',
  method: 'POST',
  permission: adminPermissionKey('actions.table.view'),
  handler: async ({ body: { table } }) => {
    return await getVisibleTableDetail({ table });
  },
});

export default api;
