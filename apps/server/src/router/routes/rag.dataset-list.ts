import { listRagDatasets } from '@/hooks/rag/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/rag/dataset/list',
  method: 'POST',
  permission: adminPermissionKey('pages.rag.dataset'),
  handler: async ({ body, __token }) => {
    return await listRagDatasets(body, getUploadActor(__token));
  },
});

export default api;
