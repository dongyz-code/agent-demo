import {
  applyResetPlan,
  detailTableOperations,
} from '@/hooks/table-management/index.js';
import { addUserLog } from '@/hooks/user-log/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/reset-apply',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.table'),
  handler: async ({ operator, ip, body: { op_id, confirm } }) => {
    const [operation] = await detailTableOperations([op_id]);
    try {
      const result = await applyResetPlan({
        user_id: operator,
        op_id,
        confirm,
      });
      await addUserLog({
        key: 'table.apply',
        user_id: operator,
        ip,
        search_key: op_id,
        detail: {
          op_id,
          type: 'reset',
          table: operation?.table_key ?? '-',
          status: 'completed',
        },
      });
      return result;
    } catch (error) {
      await addUserLog({
        key: 'table.apply',
        user_id: operator,
        ip,
        search_key: op_id,
        detail: {
          op_id,
          type: 'reset',
          table: operation?.table_key ?? '-',
          status: 'failed',
        },
      });
      throw error;
    }
  },
});

export default api;
