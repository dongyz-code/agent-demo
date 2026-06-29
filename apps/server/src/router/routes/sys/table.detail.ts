import { getVisibleTableDetail } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.table'),
  handler: async ({ operator, body: { table } }) => {
    return await getVisibleTableDetail({
      user_id: operator,
      table,
    });
  },
});

export default api;
