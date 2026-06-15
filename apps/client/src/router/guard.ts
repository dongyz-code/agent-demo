import { redirect } from '@tanstack/react-router';

import { routePathMap } from './routes';
import { useSessionModel } from '@/model/session';

import type { RouteMeta } from './type';

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

  const permissionSet = new Set(permission);
  const allow = meta.permissions.every((key) => permissionSet.has(key));

  if (!allow) {
    throw redirect({
      to: routePathMap.notFound,
    });
  }
}
