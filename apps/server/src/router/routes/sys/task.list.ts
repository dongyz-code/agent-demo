import { sqlList } from '@/hooks/task/index.js';
import {
  enrichFileTaskList,
  findFileProcessingTaskIds,
} from '@/hooks/documents/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/list',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.task'),
  handler: async ({ body }) => {
    const form = body.form ?? {};
    let taskIds: string[] | undefined;
    if (form.file_name?.trim() || form.dataset_id) {
      taskIds = await findFileProcessingTaskIds({
        file_name: form.file_name,
        dataset_id: form.dataset_id,
      });
      if (!taskIds.length) return { list: [], count: 0 };
    }
    const { list, count } = await sqlList({
      limit: body.limit,
      withCount: body.withCount,
      form,
      taskIds,
    });
    const enriched = list.length
      ? await enrichFileTaskList(list.map((task) => task.task_id))
      : new Map();
    return {
      list: list.map((task) => ({
        ...task,
        running: false,
        file_task: enriched.get(task.task_id) ?? null,
      })),
      count,
    };
  },
});

export default api;
