import { ROOT_ERROR } from '@/configs/index.js';
import {
  createDocumentProcessingTask,
  getDocumentProcessingTask,
} from '@/hooks/documents/tasks/task.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-retry',
  method: 'POST',
  permission: adminPermissionKey('actions.task.retry'),
  handler: async ({ body, __token }) => {
    const source = await getDocumentProcessingTask(body.taskId);
    if (
      !['succeeded', 'failed', 'canceled', 'timed_out'].includes(source.status)
    ) {
      throw new ROOT_ERROR('数据异常');
    }
    const retried = await createDocumentProcessingTask(
      {
        documentId: source.documentId,
        documentVersionId: source.documentVersionId,
        parts: source.parts,
        contentConfigVersion: source.processingConfigVersions.content,
        triggerSource: source.status === 'succeeded' ? 'rerun' : 'retry',
      },
      __token.user_id,
    );
    if (!retried) throw new ROOT_ERROR('数据异常');
    return retried;
  },
});

export default api;
