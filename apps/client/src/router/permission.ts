import { hasAllPermissions } from '@repo/shared/permission';

import type { AdminPermissionKey } from '@repo/shared/permission';

/**
 * 判断 client 路由是否对当前用户可访问。
 *
 * @param options 路由声明、用户权限和系统管理员标记。
 * @returns 路由无需权限、用户为系统管理员或满足全部声明权限时返回 true。
 */
export function canAccessClientRoute({
  permissions,
  permission,
  sysAdmin = false,
}: {
  /** 当前路由声明的全部必需权限。 */
  permissions?: readonly AdminPermissionKey[];
  /** 当前认证用户从服务端取得的有效权限。 */
  permission: readonly AdminPermissionKey[];
  /** 是否为不受普通权限限制的系统管理员。 */
  sysAdmin?: boolean;
}) {
  if (sysAdmin || !permissions?.length) {
    return true;
  }
  return hasAllPermissions(permission, permissions);
}
