import { disableRagDataset } from '@/hooks/rag/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/rag/dataset/disable',
  method: 'POST',
  permission: adminPermissionKey('actions.rag.dataset.update'),
  handler: async ({ body, __token }) => {
    return await disableRagDataset(body.datasetId, getUploadActor(__token));
  },
});

export default api;
