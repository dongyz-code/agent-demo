import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { cacheSpaces } from '@/hooks/cache/index.js';

const { api } = routerHandler({
  url: '/sys/cache/list',
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
    return cacheSpaces;
  },
});
export default api;
