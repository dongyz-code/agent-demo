import { removeFile } from '@/hooks/upload/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/file/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.file.delete'),
  handler: async ({ body, __token }) => {
    await removeFile(body.fileId, getUploadActor(__token));
    return 'ok';
  },
});

export default api;
