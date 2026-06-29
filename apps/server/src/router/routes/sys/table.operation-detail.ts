import { ROOT_ERROR } from '@/configs/index.js';
import {
  assertTablePermission,
  detailTableOperations,
  getTablePermissionContext,
} from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/operation-detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.table'),
  handler: async ({ operator, body: { ids } }) => {
    const context = await getTablePermissionContext(operator);
    const list = await detailTableOperations(ids);
    if (list.length !== ids.length) {
      throw new ROOT_ERROR('非法参数');
    }
    list.forEach((item) => {
      assertTablePermission({
        context,
        table: item.table_key,
        action: 'view',
      });
    });
    return list;
  },
});

export default api;
