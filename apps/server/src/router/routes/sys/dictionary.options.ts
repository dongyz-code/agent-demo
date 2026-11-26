import { routerHandler } from '@/router/utils.js';
import { dictionaryOptions } from '@/hooks/dictionaries.js';
import { dictionaryCodeSchema } from './dictionary.schema.js';

const { api } = routerHandler({
  url: '/sys/dictionary/options',
  method: 'POST',
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      properties: { code: dictionaryCodeSchema },
      required: ['code'],
    },
  },
  handler: async ({ body }) => {
    return await dictionaryOptions(body.code);
  },
});
export default api;
