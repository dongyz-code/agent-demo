import { listDocuments } from '@/hooks/document/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/document/list',
  method: 'POST',
  permission: adminPermissionKey('pages.rag.dataset'),
  handler: async ({ body, __token }) => {
    return await listDocuments(body, getUploadActor(__token));
  },
});

export default api;
