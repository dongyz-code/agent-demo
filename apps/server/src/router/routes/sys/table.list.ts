import { listVisibleTables } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.table'),
  handler: async ({ operator, body }) => {
    const list = await listVisibleTables({
      user_id: operator,
      search: body.search?.trim(),
      physicalStatus: body.physicalStatus,
      diffLevel: body.diffLevel,
    });
    const [start = 0, end = list.length] = body.limit ?? [];

    return {
      list: list.slice(start, end),
      count: body.withCount ? list.length : 0,
    };
  },
});

export default api;
