import { createRagDataset } from '@/hooks/rag/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/rag/dataset/create',
  method: 'POST',
  permission: adminPermissionKey('actions.rag.dataset.create'),
  handler: async ({ body, __token }) => {
    return await createRagDataset(body, getUploadActor(__token));
  },
});

export default api;
