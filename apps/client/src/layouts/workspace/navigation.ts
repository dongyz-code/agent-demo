import type {
  IconComponent,
  RouteMeta,
  RouteName,
  RoutePath,
} from '@/router';
import type { AdminPermissionKey } from '@repo/shared/permission';

import { canAccessClientRoute, routePathMap, routes } from '@/router';

export type WorkspaceNavItem = {
  name: RouteName;
  label: string;
  to: RoutePath;
  icon: IconComponent;
};

/**
 * 根据已确认会话生成工作区导航，权限语义与路由守卫保持一致。
 *
 * @param options 当前用户权限和系统管理员标记。
 * @returns 当前用户可以进入的导航项。
 */
export function getWorkspaceNavigation({
  permission,
  sysAdmin = false,
}: {
  /** 当前认证用户从服务端取得的有效权限。 */
  permission: readonly AdminPermissionKey[];
  /** 是否为不受普通权限限制的系统管理员。 */
  sysAdmin?: boolean;
}): WorkspaceNavItem[] {
  return routes
    .map((route) => ({
      ...route,
      meta: route.meta as RouteMeta,
    }))
    .filter(
      ({ layout, meta }) =>
        layout === 'workspace' &&
        meta.nav &&
        meta.nav.hidden !== true &&
        canAccessClientRoute({
          permissions: meta.permissions,
          permission,
          sysAdmin,
        }),
    )
    .sort((a, b) => (a.meta.nav?.order ?? 0) - (b.meta.nav?.order ?? 0))
    .map(({ name, meta }) => ({
      name,
      label: meta.title,
      to: routePathMap[name],
      icon: meta.nav!.icon,
    }));
}
