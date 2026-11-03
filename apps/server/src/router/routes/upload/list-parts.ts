import { upload } from '@/hooks/upload/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/upload/list-parts',
  method: 'POST',
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: ['sessionId'],
      properties: {
        sessionId: { type: 'string', minLength: 1, maxLength: 255 },
      },
    },
  },
  handler: async ({ body, __token }) =>
    await upload.listParts(body.sessionId, __token.user_id),
});

export default api;
