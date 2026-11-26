import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { saveDictionary } from '@/hooks/dictionaries.js';
import {
  dictionaryBaseProperties,
  dictionaryCodeSchema,
} from './dictionary.schema.js';

const { api } = routerHandler({
  url: '/sys/dictionary/save',
  method: 'POST',
  permission: adminPermissionKey('actions.dictionary.edit'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...dictionaryBaseProperties,
        code: dictionaryCodeSchema,
        name: { type: 'string', minLength: 1, maxLength: 100 },
      },
      required: ['code', 'name', 'enabled', 'remark'],
    },
  },
  handler: async ({ body, operator }) => {
    await saveDictionary(body, operator);
    return 'ok';
  },
});
export default api;
