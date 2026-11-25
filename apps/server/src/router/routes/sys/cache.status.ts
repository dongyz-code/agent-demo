import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { redisStatus } from '@/hooks/cache/index.js';

const { api } = routerHandler({
  url: '/sys/cache/status',
  method: 'POST',
  permission: adminPermissionKey('pages.monitor.cache'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
  handler: async () => {
    return await redisStatus();
  },
});
export default api;
