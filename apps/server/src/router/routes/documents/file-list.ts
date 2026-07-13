import { listManagedFiles } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.management'),
  handler: async ({ body, __token }) => {
    return await listManagedFiles(body, getUploadActor(__token));
  },
});

export default api;
