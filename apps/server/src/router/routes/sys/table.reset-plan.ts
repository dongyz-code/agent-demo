import { addUserLog } from '@/hooks/user-log/index.js';
import { createResetPlan } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/reset-plan',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.table'),
  handler: async ({ operator, ip, body: { table, columnMappings } }) => {
    const plan = await createResetPlan({
      user_id: operator,
      table,
      columnMappings,
    });
    await addUserLog({
      key: 'table.plan',
      user_id: operator,
      ip,
      search_key: plan.op_id,
      detail: {
        op_id: plan.op_id,
        type: 'reset',
        table,
      },
    });
    return plan;
  },
});

export default api;
