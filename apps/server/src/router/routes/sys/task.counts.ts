import { sqlCounts } from '@/hooks/task/index.js';
import { findFileProcessingTaskIds } from '@/hooks/documents/index.js';
import { getTaskVisibility } from '@/router/task-visibility.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/counts',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body, __token }) => {
    const visibility = await getTaskVisibility(__token);
    const form = body.form ?? {};
    let taskIds: string[] | undefined;
    if (form.file_name?.trim() || form.dataset_id) {
      taskIds = await findFileProcessingTaskIds({
        file_name: form.file_name,
        dataset_id: form.dataset_id,
      });
      if (!taskIds.length) return [];
    }
    return await sqlCounts(form, visibility, taskIds);
  },
});

export default api;
