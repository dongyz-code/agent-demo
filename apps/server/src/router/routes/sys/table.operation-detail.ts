import { ROOT_ERROR } from '@/configs/index.js';
import { detailTableOperations } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/operation-detail',
  method: 'POST',
  permission: adminPermissionKey('actions.table.view'),
  handler: async ({ body: { ids } }) => {
    const list = await detailTableOperations(ids);
    if (list.length !== ids.length) {
      throw new ROOT_ERROR('非法参数');
    }
    return list;
  },
});

export default api;
