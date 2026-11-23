import { getUserGroup } from '@/hooks/groups.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/group/detail',
  method: 'POST',
  permission: adminPermissionKey('pages.sys.sys.group'),
  handler: async ({ body }) => await getUserGroup(body.userGroupId),
});

export default api;
