import { ROOT_ERROR } from '@/configs/index.js';
import { cancelDocumentProcessingTask } from '@/hooks/documents/document-process-action.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-cancel',
  method: 'POST',
  permission: adminPermissionKey('actions.task.kill'),
  handler: async ({ body, __token }) => {
    const canceled = await cancelDocumentProcessingTask(
      body.taskId,
      __token.user_id,
    );
    if (!canceled) throw new ROOT_ERROR('数据异常');
    return 'ok' as const;
  },
});

export default api;
