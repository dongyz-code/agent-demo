import { adminPermissionKey } from '@repo/shared/permission';
import { routerHandler } from '@/router/utils.js';
import { removeDictionary } from '@/hooks/dictionaries.js';
import { dictionaryIdSchema } from './dictionary.schema.js';

const { api } = routerHandler({
  url: '/sys/dictionary/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.dictionary.delete'),
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: { id: dictionaryIdSchema },
      required: ['id'],
    },
  },
  handler: async ({ body }) => {
    await removeDictionary(body.id);
    return 'ok';
  },
});
export default api;
