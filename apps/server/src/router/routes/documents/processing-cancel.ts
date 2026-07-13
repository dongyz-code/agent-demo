import { cancelFileProcessingTask } from '@/hooks/documents/index.js';
import { getUploadActor } from '@/router/actor.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';
import { getFileTaskScope } from '@/router/file-task-scope.js';

const { api } = routerHandler({
  url: '/documents/processing-cancel',
  method: 'POST',
  permission: adminPermissionKey('actions.task.kill'),
  handler: async ({ body, __token }) => {
    await cancelFileProcessingTask(
      body.taskId,
      getUploadActor(__token),
      await getFileTaskScope(__token.user_id),
    );
    return 'ok' as const;
  },
});

export default api;
