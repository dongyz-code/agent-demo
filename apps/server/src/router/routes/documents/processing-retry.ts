import { retryDocumentProcessingTask } from '@/hooks/documents/document-process-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-retry',
  method: 'POST',
  permission: adminPermissionKey('actions.task.retry'),
  handler: async ({ body, __token }) => {
    return await retryDocumentProcessingTask(body.taskId, __token.user_id);
  },
});

export default api;
