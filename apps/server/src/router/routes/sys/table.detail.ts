import { getVisibleTableDetail } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/table/detail',
  method: 'POST',
  handler: async ({ operator, body: { table } }) => {
    return await getVisibleTableDetail({
      user_id: operator,
      table,
    });
  },
});

export default api;
