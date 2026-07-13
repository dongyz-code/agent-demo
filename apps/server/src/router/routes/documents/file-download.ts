import { createFileDownload } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-download',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.view'),
  handler: async ({ body, __token }) => {
    return await createFileDownload(body.fileId, getUploadActor(__token));
  },
});

export default api;
