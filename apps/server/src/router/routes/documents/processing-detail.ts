import { getFileProcessingTask } from '@/hooks/documents/tasks/detail.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body }) => {
    return await getFileProcessingTask(body.taskId);
  },
});

export default api;
