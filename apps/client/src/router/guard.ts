import { redirect } from '@tanstack/react-router';

import { routePathMap } from './routes';
import { useSessionModel } from '@/model/session';

import type { RouteMeta } from './type';

/**
 * 根据路由元信息和当前登录态执行客户端跳转守卫。
 *
 * @param meta 当前匹配路由声明的访问控制信息。
 * @returns 校验通过时正常返回；不满足访问条件时抛出重定向。
 */
export function routeGuard(meta: RouteMeta) {
  const { isAuthenticated, permission, user } = useSessionModel.getState();

  if (meta.guestOnly && isAuthenticated) {
    throw redirect({
      to: routePathMap.dashboard,
    });
  }

  if (meta.auth && !isAuthenticated) {
    throw redirect({
      to: routePathMap.login,
    });
  }

  if (!meta.permissions?.length || user?.sys_admin) {
    return;
  }

  const permissionSet: ReadonlySet<string> = new Set(permission);
  const allow = meta.permissions.every((key) => permissionSet.has(key));

  if (!allow) {
    throw redirect({
      to: routePathMap.notFound,
    });
  }
}
