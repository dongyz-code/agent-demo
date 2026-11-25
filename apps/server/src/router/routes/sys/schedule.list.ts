import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorLimitSchema } from '@/hooks/monitor/index.js';
import { listSchedules } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/schedule/list',
  method: 'POST',
  permission: adminPermissionKey('pages.monitor.schedule'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {
        search: { type: 'string', maxLength: 120 },
        enabled: { type: 'boolean' },
        limit: monitorLimitSchema,
      },
    },
  },
  handler: async ({ body }) => {
    return await listSchedules(body);
  },
});
export default api;
