import { retryDocumentProcessingJob } from '@/hooks/document/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/document/processing/retry',
  method: 'POST',
  permission: adminPermissionKey('actions.document.reprocess'),
  handler: async ({ body, __token }) => {
    await retryDocumentProcessingJob(body.jobId, getUploadActor(__token));
    return 'ok';
  },
});

export default api;
