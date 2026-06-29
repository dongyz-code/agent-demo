import { ROOT_ERROR } from '@/configs/index.js';

import { hasTablePermission } from './permission-utils.js';
import { getAdminPermissionContext } from '@/hooks/admin-permission/index.js';

import type { TablePermissionAction } from '@repo/types';
import type { TablePermissionContext } from './types.js';

export {
  hasTablePagePermission,
  hasTablePermission,
  listTablePermissions,
} from './permission-utils.js';

/** 读取当前用户的表管理权限上下文，用于后端强制校验。 */
export async function getTablePermissionContext(
  user_id: string,
): Promise<TablePermissionContext> {
  return await getAdminPermissionContext(user_id);
}

/** 断言当前用户具备指定表和动作权限，不满足时抛出统一业务错误。 */
export function assertTablePermission(opts: {
  /** 当前权限上下文。 */
  context: TablePermissionContext;
  /** schemaTables 中的表 key。 */
  table: string;
  /** 需要判断的表管理动作。 */
  action: TablePermissionAction;
}) {
  if (!hasTablePermission(opts)) {
    throw new ROOT_ERROR('认证: 权限不足');
  }
}
