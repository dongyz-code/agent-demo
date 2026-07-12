import { createFileDownload } from '@/hooks/upload/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/file/download',
  method: 'POST',
  permission: adminPermissionKey('actions.file.view'),
  handler: async ({ body, __token }) => {
    return await createFileDownload(body.fileId, getUploadActor(__token));
  },
});

export default api;
