import { listDatasetDocuments } from '@/hooks/rag/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/rag/dataset-document/list',
  method: 'POST',
  permission: adminPermissionKey('pages.rag.dataset'),
  handler: async ({ body, __token }) => {
    return await listDatasetDocuments(body, getUploadActor(__token));
  },
});

export default api;
