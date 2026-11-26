import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorIdSchema } from '@/router/monitor.js';
import { runSchedule } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/schedule/run',
  method: 'POST',
  permission: adminPermissionKey('actions.schedule.run'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'requestId'],
      properties: { id: monitorIdSchema, requestId: monitorIdSchema },
    },
  },
  handler: async ({ body, operator }) => {
    return await runSchedule(body.id, body.requestId, operator);
  },
});
export default api;
