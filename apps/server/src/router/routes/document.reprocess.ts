import { reprocessDocument } from '@/hooks/document/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/document/reprocess',
  method: 'POST',
  permission: adminPermissionKey('actions.document.reprocess'),
  handler: async ({ body, __token }) => {
    return await reprocessDocument(body.documentId, getUploadActor(__token));
  },
});

export default api;
