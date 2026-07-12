import { finishUpload } from '@/hooks/upload/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/upload/complete',
  method: 'POST',
  permission: adminPermissionKey('actions.file.upload'),
  handler: async ({ body, __token }) => {
    return await finishUpload(
      body.sessionId,
      body.parts,
      getUploadActor(__token),
    );
  },
});

export default api;
