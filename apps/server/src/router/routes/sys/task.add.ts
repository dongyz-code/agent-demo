import { ROOT } from '@/configs/env.js';
import { taskAddHelper } from '@/hooks/task/index.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/task/add',
  method: 'POST',
  permission: adminPermissionKey('actions.task.add'),
  handler: async ({ body, __token: { user_id } }) => {
    const execution_user_id =
      user_id === ROOT.SYS_ADMIN_USER_ID ? null : user_id;

    if ('history_task_id' in body) {
      const val = await taskAddHelper({
        ...body,
        sqlInfo: {
          trigger_method: 'manual',
          execution_user_id,
        },
      });
      return { task_id: val.task_id };
    } else {
      throw new Error('当前没有允许前端提交的任务类型');
    }
  },
});

export default api;
