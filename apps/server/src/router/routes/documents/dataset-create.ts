import { createRagDataset } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-create',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-create'),
  handler: async ({ body, __token }) => {
    return await createRagDataset(body, getUploadActor(__token));
  },
});

export default api;
