import { addUserLog } from '@/hooks/user-log/index.js';
import { createSyncPlan } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/table/sync-plan',
  method: 'POST',
  permission: adminPermissionKey('actions.table.sync'),
  handler: async ({ operator, ip, body: { table } }) => {
    const plan = await createSyncPlan({
      user_id: operator,
      table,
    });
    await addUserLog({
      key: 'table.plan',
      user_id: operator,
      ip,
      search_key: plan.op_id,
      detail: { op_id: plan.op_id, type: 'sync', table },
    });
    return plan;
  },
});
export default api;
