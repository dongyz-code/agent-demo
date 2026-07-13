import { hasAdminPermissionKey } from '@repo/shared/permission';

import { getAdminPermissionContext } from './permission.js';

/** 返回文件任务详情与操作使用的所有者或租户范围。 */
export async function getFileTaskScope(userId: string) {
  const context = await getAdminPermissionContext(userId);
  return context.sys_admin ||
    hasAdminPermissionKey(context.permissions, 'pages.documents.dataset')
    ? ('tenant' as const)
    : ('owner' as const);
}

