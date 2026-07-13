import { getFileProcessingOptions } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/file-processing-options',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.management'),
  handler: async ({ __token }) => {
    return await getFileProcessingOptions(getUploadActor(__token));
  },
});

export default api;
