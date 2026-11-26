import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { listDictionaries } from '@/hooks/dictionaries.js';
import { dictionaryQueryProperties } from './dictionary.schema.js';

const { api } = routerHandler({
  url: '/sys/dictionary/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.dictionary'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {
        search: dictionaryQueryProperties.search,
        enabled: dictionaryQueryProperties.enabled,
        limit: dictionaryQueryProperties.limit,
      },
      required: [],
    },
  },
  handler: async ({ body }) => {
    return await listDictionaries(body);
  },
});
export default api;
