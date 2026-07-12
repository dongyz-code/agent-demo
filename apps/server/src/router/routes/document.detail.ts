import { getDocument } from '@/hooks/document/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/document/detail',
  method: 'POST',
  permission: adminPermissionKey('pages.rag.dataset'),
  handler: async ({ body, __token }) => {
    return await getDocument(body.documentId, getUploadActor(__token));
  },
});

export default api;
