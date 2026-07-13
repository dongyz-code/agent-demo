import { cancelUpload } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-abort',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    await cancelUpload(body.sessionId, getUploadActor(__token));
    return 'ok';
  },
});

export default api;
