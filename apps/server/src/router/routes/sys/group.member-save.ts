import { saveUserGroupMembers } from '@/hooks/groups.js';
import { routerHandler } from '@/router/utils.js';
import { adminPermissionKey } from '@repo/shared/permission';

const { api } = routerHandler({
  url: '/sys/group/member-save',
  method: 'POST',
  permission: adminPermissionKey('actions.group.member'),
  handler: async ({ body, __token }) =>
    await saveUserGroupMembers(
      body.userGroupId,
      body.userIds,
      __token.user_id,
    ),
});

export default api;
