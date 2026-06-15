import {
  getAuthorizedTableState,
  getTablePreview,
} from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/table/preview',
  method: 'POST',
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
