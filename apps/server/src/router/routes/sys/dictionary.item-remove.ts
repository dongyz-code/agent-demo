import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { removeDictionaryItem } from '@/hooks/dictionaries.js';
import { dictionaryIdSchema } from './dictionary.schema.js';

const { api } = routerHandler({
  url: '/sys/dictionary/item-remove',
  method: 'POST',
  permission: adminPermissionKey('actions.dictionary.delete'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: { id: dictionaryIdSchema, dictionaryId: dictionaryIdSchema },
      required: ['id', 'dictionaryId'],
    },
  },
  handler: async ({ body }) => {
    await removeDictionaryItem(body.dictionaryId, body.id);
    return 'ok';
  },
});
export default api;
