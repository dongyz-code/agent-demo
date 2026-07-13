import { listRagDatasets } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/dataset-list',
  method: 'POST',
  permission: adminPermissionKey('pages.documents.dataset'),
  handler: async ({ body, __token }) => {
    return await listRagDatasets(body, __token.user_id);
  },
});

export default api;
