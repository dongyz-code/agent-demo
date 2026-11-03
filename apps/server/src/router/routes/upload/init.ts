import { upload } from '@/hooks/upload/index.js';
import { routerHandler } from '@/router/utils.js';

const { api } = routerHandler({
  url: '/upload/init',
  method: 'POST',
  schema: {
    body: {
      type: 'object',
      additionalProperties: false,
      required: [
        'filename',
        'contentType',
        'size',
        'idempotencyKey',
        'purpose',
      ],
      properties: {
        filename: { type: 'string', minLength: 1, maxLength: 4096 },
        contentType: { type: 'string', minLength: 1, maxLength: 255 },
        size: { type: 'integer', minimum: 1 },
        idempotencyKey: { type: 'string', minLength: 1, maxLength: 255 },
        purpose: { type: 'string', enum: ['attachment', 'document', 'avatar'] },
      },
    },
  },
  handler: async ({ body, __token }) =>
    await upload.initialize(body, __token.user_id),
});

export default api;
