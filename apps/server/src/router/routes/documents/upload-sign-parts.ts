import { signUploadParts } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-sign-parts',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    return await signUploadParts(
      body.sessionId,
      body.partNumbers,
      __token.user_id,
    );
  },
});

export default api;
