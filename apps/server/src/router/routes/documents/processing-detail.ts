import { getDocumentProcessingTask } from '@/hooks/documents/tasks/task.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body }) => {
    return await getDocumentProcessingTask(body.taskId);
  },
});

export default api;
