import { addDocumentToDataset } from '@/hooks/rag/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/rag/dataset-document/add',
  method: 'POST',
  permission: adminPermissionKey('actions.rag.dataset-document.manage'),
  handler: async ({ body, __token }) => {
    return await addDocumentToDataset(
      body.datasetId,
      body.documentId,
      getUploadActor(__token),
    );
  },
});

export default api;
