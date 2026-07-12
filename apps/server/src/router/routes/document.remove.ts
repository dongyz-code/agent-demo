import { removeDocument } from '@/hooks/document/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/document/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.document.delete'),
  handler: async ({ body, __token }) => {
    await removeDocument(body.documentId, getUploadActor(__token));
    return 'ok';
  },
});

export default api;
