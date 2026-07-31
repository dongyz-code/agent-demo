import { getOwnedUploadSession } from '@/hooks/documents/file/session.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-status',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    const session = await getOwnedUploadSession(
      body.sessionId,
      __token.user_id,
    );
    return { status: session.status };
  },
});

export default api;
