import {
  getAuthorizedTableState,
  getTablePreview,
} from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/preview',
  method: 'POST',
  permission: adminPermissionKey('actions.table.preview'),
  handler: async ({ body: { table, offset, limit } }) => {
    const { schemaTable, catalogTable } = await getAuthorizedTableState({
      table,
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
