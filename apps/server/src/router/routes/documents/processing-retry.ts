import { ROOT_ERROR } from '@/configs/index.js';
import {
  createFileProcessingTask,
  getFileProcessingTask,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/documents/processing-retry',
  method: 'POST',
  permission: adminPermissionKey('actions.task.retry'),
  handler: async ({ body, __token }) => {
    const source = await getFileProcessingTask(body.taskId);
    if (!['failed', 'completed'].includes(source.status)) {
      throw new ROOT_ERROR(
        '数据异常',
        'FILE_PROCESSING_TASK_STATE_CONFLICT: 只有失败或成功任务可以重新执行',
      );
    }
    if (!source.datasetId) {
      throw new ROOT_ERROR(
        '数据异常',
        'FILE_PROCESSING_DATASET_REQUIRED: 原任务缺少目标知识库',
      );
    }
    return await createFileProcessingTask(
      {
        fileId: source.fileId,
        datasetId: source.datasetId,
        processingConfigVersion: source.processingConfigVersion,
        triggerSource: source.status === 'failed' ? 'retry' : 'rerun',
      },
      __token.user_id,
    );
  },
});

export default api;
