import { updateRagDataset } from '@/hooks/rag/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/rag/dataset/update',
  method: 'POST',
  permission: adminPermissionKey('actions.rag.dataset.update'),
  handler: async ({ body, __token }) => {
    return await updateRagDataset(
      body.datasetId,
      body.update,
      getUploadActor(__token),
    );
  },
});

export default api;
