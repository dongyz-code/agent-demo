import { getUploadSessionInfo } from '@/hooks/upload/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/upload/status',
  method: 'POST',
  permission: adminPermissionKey('actions.file.upload'),
  handler: async ({ body, __token }) => {
    return await getUploadSessionInfo(body.sessionId, getUploadActor(__token));
  },
});

export default api;
