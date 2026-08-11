import { uploadAction } from '@/hooks/documents/upload-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-status',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    return await uploadAction.getStatus(body.sessionId, __token.user_id);
  },
});

export default api;
