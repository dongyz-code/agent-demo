import { createDocument } from '@/hooks/document/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/document/create',
  method: 'POST',
  permission: adminPermissionKey('actions.document.create'),
  handler: async ({ body, __token }) => {
    return await createDocument(body, getUploadActor(__token));
  },
});

export default api;
