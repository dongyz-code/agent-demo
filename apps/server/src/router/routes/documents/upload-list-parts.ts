import { syncDocumentUploadParts } from '@/hooks/documents/upload/multipart.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-list-parts',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) =>
    await syncDocumentUploadParts(body.sessionId, __token.user_id),
});

export default api;
