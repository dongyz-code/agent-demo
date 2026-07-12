import { cancelUpload } from '@/hooks/upload/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/upload/abort',
  method: 'POST',
  permission: adminPermissionKey('actions.file.upload'),
  handler: async ({ body, __token }) => {
    await cancelUpload(body.sessionId, getUploadActor(__token));
    return 'ok';
  },
});

export default api;
