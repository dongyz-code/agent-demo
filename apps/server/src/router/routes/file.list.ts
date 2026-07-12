import { listFiles } from '@/hooks/upload/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/file/list',
  method: 'POST',
  permission: adminPermissionKey('pages.file.management'),
  handler: async ({ body, __token }) => {
    return await listFiles(body, getUploadActor(__token));
  },
});

export default api;
