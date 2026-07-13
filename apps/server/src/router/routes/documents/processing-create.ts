import { createFileProcessingTask } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-create',
  method: 'POST',
  permission: adminPermissionKey('actions.documents.process'),
  handler: async ({ body, __token }) => {
    return await createFileProcessingTask(body, getUploadActor(__token));
  },
});

export default api;
