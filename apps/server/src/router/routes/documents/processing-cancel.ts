import { cancelFileProcessingTask } from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-cancel',
  method: 'POST',
  permission: adminPermissionKey('actions.task.kill'),
  handler: async ({ body }) => {
    await cancelFileProcessingTask(body.taskId);
    return 'ok' as const;
  },
});

export default api;
