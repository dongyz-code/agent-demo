import { getFileProcessingTask } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { getFileTaskScope } from '@/router/file-task-scope.js';

const { api } = routerHandler({
  url: '/documents/processing-detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body, __token }) => {
    return await getFileProcessingTask(
      body.taskId,
      getUploadActor(__token),
      await getFileTaskScope(__token.user_id),
    );
  },
});

export default api;
