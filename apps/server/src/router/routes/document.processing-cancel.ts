import { cancelDocumentProcessingJob } from '@/hooks/document/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/document/processing/cancel',
  method: 'POST',
  permission: adminPermissionKey('actions.document.reprocess'),
  handler: async ({ body, __token }) => {
    await cancelDocumentProcessingJob(body.jobId, getUploadActor(__token));
    return 'ok';
  },
});

export default api;
