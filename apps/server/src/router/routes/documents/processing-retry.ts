import { ROOT_ERROR } from '@/configs/index.js';
import { createDocumentContentTask } from '@/hooks/documents/document/content/task.js';
import { getFileProcessingTask } from '@/hooks/documents/tasks/detail.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-retry',
  method: 'POST',
  permission: adminPermissionKey('actions.task.retry'),
  handler: async ({ body, __token }) => {
    const source = await getFileProcessingTask(body.taskId);
    if (!['failed', 'completed', 'killed'].includes(source.status)) {
      throw new ROOT_ERROR('数据异常');
    }
    if (source.taskType !== 'content') {
      throw new ROOT_ERROR('数据异常');
    }
    return await createDocumentContentTask(
      {
        documentId: source.documentId,
        documentVersionId: source.documentVersionId,
        processingConfigVersion: source.processingConfigVersion,
        triggerSource: source.status === 'completed' ? 'rerun' : 'retry',
      },
      __token.user_id,
    );
  },
});

export default api;
