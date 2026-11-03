import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-version-create',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  schema: {
    body: {
      type: 'object',
      required: ['key'],
      additionalProperties: false,
      properties: {
        key: { type: 'string', minLength: 1, maxLength: 255 },
        documentId: { type: 'string', minLength: 1, maxLength: 255 },
      },
    },
  },
  handler: async ({ body, __token }) =>
    await documentAction.bindUploadedFile(body, __token.user_id),
});

export default api;
