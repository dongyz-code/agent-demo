import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { scheduleHandlers } from '@/hooks/schedules/handlers.js';

const { api } = routerHandler({
  url: '/sys/schedule/handlers',
  method: 'POST',
  permission: adminPermissionKey('pages.monitor.schedule'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  handler: async () => {
    return scheduleHandlers;
  },
});
export default api;
