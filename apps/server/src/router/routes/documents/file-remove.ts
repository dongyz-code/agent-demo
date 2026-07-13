import { removeFile } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-remove',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.delete'),
  handler: async ({ body, __token }) => {
    await removeFile(body.fileId, getUploadActor(__token));
    return 'ok';
  },
});

export default api;
