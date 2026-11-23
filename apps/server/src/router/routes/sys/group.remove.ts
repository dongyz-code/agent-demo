import { deleteUserGroup } from '@/hooks/groups.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/group/remove',
  method: 'POST',
  permission: adminPermissionKey('actions.group.delete'),
  handler: async ({ body }) => {
    await deleteUserGroup(body.userGroupId);
    return 'ok' as const;
  },
});

export default api;
