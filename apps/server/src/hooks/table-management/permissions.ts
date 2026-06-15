import { ROOT, ROOT_ERROR } from '@/configs/index.js';
import { db, schema } from '@/database/index.js';
import { eq, inArray } from 'drizzle-orm';

import { hasTablePermission } from './permission-utils.js';

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
  if (user_id === ROOT.SYS_ADMIN_USER_ID) {
    return {
      user_id,
      sys_admin: true,
      permissions: new Set(),
    };
  }

  const roles = await db
    .select({ role_id: schema.user_role.role_id })
    .from(schema.user_role)
    .where(eq(schema.user_role.user_id, user_id));

  if (!roles.length) {
    return {
      user_id,
      sys_admin: false,
      permissions: new Set(),
    };
  }

  const rows = await db
    .select({ permission: schema.role.permission })
    .from(schema.role)
    .where(inArray(schema.role.role_id, roles.map((item) => item.role_id)));

  const permissions = new Set<string>();
  rows.forEach(({ permission }) => {
    if (!permission) {
      return;
    }
    (JSON.parse(permission) as string[]).forEach((key) => {
      permissions.add(key);
    });
  });

  return {
    user_id,
    sys_admin: false,
    permissions,
  };
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
