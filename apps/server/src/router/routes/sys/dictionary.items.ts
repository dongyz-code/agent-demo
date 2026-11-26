import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { listDictionaryItems } from '@/hooks/dictionaries.js';
import {
  dictionaryIdSchema,
  dictionaryQueryProperties,
} from './dictionary.schema.js';

const { api } = routerHandler({
  url: '/sys/dictionary/items',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.dictionary'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...dictionaryQueryProperties,
        dictionaryId: dictionaryIdSchema,
      },
      required: ['dictionaryId'],
    },
  },
  handler: async ({ body }) => {
    return await listDictionaryItems(body.dictionaryId, body);
  },
});
export default api;
