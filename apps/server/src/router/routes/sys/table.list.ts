import { listVisibleTables } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/table/list',
  method: 'POST',
  handler: async ({ operator, body }) => {
    return {
      list: await listVisibleTables({
        user_id: operator,
        search: body.search?.trim(),
        physicalStatus: body.physicalStatus,
        diffLevel: body.diffLevel,
      }),
    };
  },
});

export default api;
