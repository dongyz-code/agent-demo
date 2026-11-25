import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import {
  cacheOperation,
  cacheRequestProperties,
} from '@/hooks/monitor/index.js';
import { clearCache } from '@/hooks/cache/index.js';
import { auditMonitor } from '@/hooks/schedules/index.js';

const { api } = routerHandler({
  url: '/sys/cache/clear',
  method: 'POST',
  permission: adminPermissionKey('actions.cache.clear'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: cacheRequestProperties,
    },
  },
  handler: async ({ body, operator }) => {
    await auditMonitor(
      'cache.clear.request',
      `${body.name}:${body.key ?? '*'}`,
      operator,
    );
    return await cacheOperation(() =>
      clearCache(body.name, body.key, body.cursor),
    );
  },
});
export default api;
