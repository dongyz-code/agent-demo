import { addUserLog } from '@/hooks/user-log/index.js';
import { createRenamePlan } from '@/hooks/table-management/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/sys/table/rename-plan',
  method: 'POST',
  handler: async ({
    operator,
    ip,
    body: { table, oldTableName, columnMappings },
  }) => {
    const plan = await createRenamePlan({
      user_id: operator,
      table,
      oldTableName,
      columnMappings,
    });
    await addUserLog({
      key: 'table.plan',
      user_id: operator,
      ip,
      search_key: plan.op_id,
      detail: {
        op_id: plan.op_id,
        type: 'rename',
        table,
      },
    });
    return plan;
  },
});

export default api;
