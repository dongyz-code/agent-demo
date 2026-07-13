import { getUploadedParts } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-list-parts',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    return await getUploadedParts(body.sessionId, getUploadActor(__token));
  },
});

export default api;
