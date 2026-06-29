import type { TablePermissionAction } from '@repo/types';
import type { TablePermissionContext } from './types.js';
import { adminPermissionKey } from '@repo/shared/permission';

const globalActionMap: Record<TablePermissionAction, string> = {
  view: adminPermissionKey('actions.table.view'),
  preview: adminPermissionKey('actions.table.preview'),
  rename: adminPermissionKey('actions.table.rename'),
  reset: adminPermissionKey('actions.table.reset'),
};

/** 判断当前用户是否拥有表管理页面入口权限。 */
export function hasTablePagePermission(context: TablePermissionContext) {
  return (
    context.sys_admin ||
    context.permissions.has(adminPermissionKey('pages.sys.sys.table'))
  );
}

/** 判断当前用户是否拥有指定表和指定动作的权限。 */
export function hasTablePermission({
  context,
  table,
  action,
}: {
  /** 当前权限上下文。 */
  context: TablePermissionContext;
  /** schemaTables 中的表 key。 */
  table: string;
  /** 需要判断的表管理动作。 */
  action: TablePermissionAction;
}) {
  if (context.sys_admin) {
    return true;
  }

  if (!hasTablePagePermission(context)) {
    return false;
  }

  return [
    globalActionMap[action],
    `actions.table.*.${action}`,
    `actions.table.${table}.${action}`,
  ].some((key) => context.permissions.has(key));
}

/** 返回当前用户对单表拥有的全部操作权限。 */
export function listTablePermissions({
  context,
  table,
}: {
  /** 当前权限上下文。 */
  context: TablePermissionContext;
  /** schemaTables 中的表 key。 */
  table: string;
}): TablePermissionAction[] {
  const actions: TablePermissionAction[] = ['view', 'preview', 'rename', 'reset'];
  return actions.filter((action) => hasTablePermission({ context, table, action }));
}
