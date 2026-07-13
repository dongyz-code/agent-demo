import { retryFileProcessingTask } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { getFileTaskScope } from '@/router/file-task-scope.js';

const { api } = routerHandler({
  url: '/documents/processing-retry',
  method: 'POST',
  permission: adminPermissionKey('actions.task.retry'),
  handler: async ({ body, __token }) => {
    return await retryFileProcessingTask(
      body.taskId,
      getUploadActor(__token),
      await getFileTaskScope(__token.user_id),
    );
  },
});

export default api;
