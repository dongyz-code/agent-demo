import {
  getAuthorizedTableState,
  getTablePreview,
} from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/preview',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.table'),
  handler: async ({ operator, body: { table, offset, limit } }) => {
    const { schemaTable, catalogTable } = await getAuthorizedTableState({
      user_id: operator,
      table,
      action: 'preview',
    });
    return await getTablePreview({
      schemaTable,
      catalogTable,
      offset,
      limit,
    });
  },
});

export default api;
