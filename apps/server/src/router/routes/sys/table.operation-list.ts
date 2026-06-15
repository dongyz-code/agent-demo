import { ROOT_ERROR } from '@/configs/index.js';
import {
  getTablePermissionContext,
  hasTablePagePermission,
  listTableOperations,
  listVisibleTables,
  assertTablePermission,
} from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/table/operation-list',
  method: 'POST',
  handler: async ({
    operator,
    body: { table, type, status, limit, withCount },
  }) => {
    const context = await getTablePermissionContext(operator);
    if (!hasTablePagePermission(context)) {
      throw new ROOT_ERROR('认证: 权限不足');
    }

    if (table) {
      assertTablePermission({ context, table, action: 'view' });
      return await listTableOperations({
        table,
        type,
        status,
        limit,
        withCount,
      });
    }

    const visibleTables = await listVisibleTables({ user_id: operator });
    if (!visibleTables.length) {
      return {
        list: [],
        count: 0,
      };
    }
    return await listTableOperations({
      tables: visibleTables.map((item) => item.table),
      type,
      status,
      limit,
      withCount,
    });
  },
});

export default api;
