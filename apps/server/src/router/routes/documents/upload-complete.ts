import { finishFileUpload } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/upload-complete',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.upload'),
  handler: async ({ body, __token }) => {
    return await finishFileUpload(
      body.sessionId,
      body.parts,
      getUploadActor(__token),
    );
  },
});

export default api;
