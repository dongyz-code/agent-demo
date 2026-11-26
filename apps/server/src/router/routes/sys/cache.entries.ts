import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { cacheOperation, cacheRequestProperties } from '@/router/monitor.js';
import { scanCache } from '@/hooks/cache/index.js';

const { api } = routerHandler({
  url: '/sys/cache/entries',
  method: 'POST',
  permission: adminPermissionKey('pages.monitor.cache'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: cacheRequestProperties.name,
        cursor: cacheRequestProperties.cursor,
        search: { type: 'string', maxLength: 128 },
      },
    },
  },
  handler: async ({ body }) => {
    return await cacheOperation(() =>
      scanCache(body.name, body.cursor, body.search),
    );
  },
});
export default api;
