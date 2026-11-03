import { upload } from '@/hooks/upload/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/upload/sign-parts',
  method: 'POST',
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId', 'partNumber'],
      properties: {
        sessionId: { type: 'string', minLength: 1, maxLength: 255 },
        partNumber: { type: 'integer', minimum: 1, maximum: 10000 },
      },
    },
  },
  handler: async ({ body, __token }) =>
    await upload.signPart(body, __token.user_id),
});

export default api;
