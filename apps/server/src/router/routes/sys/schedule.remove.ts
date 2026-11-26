import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorIdSchema } from '@/router/monitor.js';
import { toggleSchedule } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/schedule/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.schedule.delete'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: monitorIdSchema },
    },
  },
  handler: async ({ body, operator }) => {
    await toggleSchedule(body.id, false, operator, true);
    return 'ok';
  },
});
export default api;
