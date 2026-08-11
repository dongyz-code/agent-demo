import { documentAction } from '@/hooks/documents/document-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-cancel',
  method: 'POST',
  permission: adminPermissionKey('actions.task.kill'),
  handler: async ({ body, __token }) => {
    await documentAction.cancelProcessingTask(body.taskId, __token.user_id);
    return 'ok' as const;
  },
});

export default api;
