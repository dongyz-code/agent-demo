import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { saveDictionaryItem } from '@/hooks/dictionaries.js';
import {
  dictionaryIdSchema,
  dictionaryBaseProperties,
} from './dictionary.schema.js';

const { api } = routerHandler({
  url: '/sys/dictionary/item-save',
  method: 'POST',
  permission: adminPermissionKey('actions.dictionary.edit'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ...dictionaryBaseProperties,
        dictionaryId: dictionaryIdSchema,
        label: { type: 'string', minLength: 1, maxLength: 100 },
        value: { type: 'string', minLength: 1, maxLength: 100 },
        sort: { type: 'integer', minimum: 0, maximum: 2147483647 },
      },
      required: ['dictionaryId', 'label', 'value', 'sort', 'enabled', 'remark'],
    },
  },
  handler: async ({ body, operator }) => {
    await saveDictionaryItem(body, operator);
    return 'ok';
  },
});
export default api;
