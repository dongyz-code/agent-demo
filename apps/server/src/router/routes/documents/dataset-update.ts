import { updateRagDataset } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-update',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.dataset-update'),
  handler: async ({ body, __token }) => {
    return await updateRagDataset(
      body.datasetId,
      body.update,
      __token.user_id,
    );
  },
});

export default api;
