import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorIdSchema } from '@/router/monitor.js';
import { saveSchedule } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/schedule/save',
  method: 'POST',
  permission: adminPermissionKey('actions.schedule.edit'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'handler',
        'cron',
        'timezone',
        'enabled',
        'params',
        'description',
      ],
      properties: {
        id: monitorIdSchema,
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
          pattern: '\\S',
        },
        handler: monitorIdSchema,
        cron: { type: 'string', minLength: 1, maxLength: 120 },
        timezone: monitorIdSchema,
        enabled: { type: 'boolean' },
        params: { type: 'object', maxProperties: 30 },
        description: { type: 'string', maxLength: 2000 },
      },
    },
  },
  handler: async ({ body, operator }) => {
    return await saveSchedule(body, operator);
  },
});
export default api;
