import { setActiveDocumentVersion } from '@/hooks/documents/document/version.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/document-version-set-active',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) =>
    await setActiveDocumentVersion(
      body.documentId,
      body.documentVersionId,
      __token.user_id,
    ),
});

export default api;
