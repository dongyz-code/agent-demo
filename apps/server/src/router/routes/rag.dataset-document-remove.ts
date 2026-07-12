import { removeDocumentFromDataset } from '@/hooks/rag/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/rag/dataset-document/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.rag.dataset-document.manage'),
  handler: async ({ body, __token }) => {
    await removeDocumentFromDataset(
      body.datasetId,
      body.documentId,
      getUploadActor(__token),
    );
    return 'ok';
  },
});

export default api;
