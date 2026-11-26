import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorIdSchema } from '@/router/monitor.js';
import { toggleSchedule } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/schedule/toggle',
  method: 'POST',
  permission: adminPermissionKey('actions.schedule.toggle'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'enabled'],
      properties: { id: monitorIdSchema, enabled: { type: 'boolean' } },
    },
  },
  handler: async ({ body, operator }) => {
    await toggleSchedule(body.id, body.enabled, operator);
    return 'ok';
  },
});
export default api;
