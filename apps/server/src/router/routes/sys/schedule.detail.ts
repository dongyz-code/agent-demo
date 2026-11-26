import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorIdSchema } from '@/router/monitor.js';
import { scheduleRunDetail } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/schedule/detail',
  method: 'POST',
  permission: adminPermissionKey('pages.monitor.schedule'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: monitorIdSchema },
    },
  },
  handler: async ({ body }) => {
    return await scheduleRunDetail(body.id);
  },
});
export default api;
