import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorIdSchema, monitorLimitSchema } from '@/router/monitor.js';
import { listScheduleRuns } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/schedule/runs',
  method: 'POST',
  permission: adminPermissionKey('pages.monitor.schedule'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scheduleId: monitorIdSchema,
        search: { type: 'string', maxLength: 120 },
        status: {
          type: 'string',
          enum: [
            'queued',
            'running',
            'retrying',
            'succeeded',
            'failed',
            'timed_out',
            'canceled',
            'skipped',
          ],
        },
        trigger: { type: 'string', enum: ['scheduled', 'manual'] },
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        limit: monitorLimitSchema,
      },
    },
  },
  handler: async ({ body }) => {
    return await listScheduleRuns(body);
  },
});
export default api;
