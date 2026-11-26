import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { monitorIdSchema } from '@/router/monitor.js';
import { nextScheduleDates } from '@/hooks/schedules/policy.js';
import { ROOT_ERROR } from '@/configs/index.js';
/** 保存前验证表达式并统一报告可读配置错误。 @param cron 表达式。 @param timezone 时区。 @returns 五次触发的 ISO 时间。 */
function preview(cron: string, timezone: string): string[] {
  try {
    return nextScheduleDates(cron, timezone).map((date) => date.toISOString());
  } catch (error) {
    throw new ROOT_ERROR(
      '非法参数',
      error instanceof Error ? error.message : '表达式无效',
    );
  }
}

const { api } = routerHandler({
  url: '/sys/schedule/preview',
  method: 'POST',
  permission: adminPermissionKey('pages.monitor.schedule'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['cron', 'timezone'],
      properties: {
        cron: { type: 'string', minLength: 1, maxLength: 120 },
        timezone: monitorIdSchema,
      },
    },
  },
  handler: async ({ body }) => {
    return preview(body.cron, body.timezone);
  },
});
export default api;
