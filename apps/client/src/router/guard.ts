import { redirect } from '@tanstack/react-router';

import { api } from '@/utils/api';
import { routePathMap } from './routes';
import { useSessionModel } from '@/model/session';

import type { RouteMeta } from './type';

/** 当前页面生命周期内复用的会话校验请求。 */
let sessionVerifyPromise: Promise<void> | undefined;

/**
 * 首次路由匹配前使用 HttpOnly Cookie 向服务端确认会话，避免只信任本地缓存。
 * 同一页面生命周期内只发起一次请求，后续路由直接复用已确认的状态。
 *
 * @returns 服务端会话校验和本地状态同步完成后结束。
 */
async function verifySession(): Promise<void> {
  if (sessionVerifyPromise) {
    return sessionVerifyPromise;
  }

  sessionVerifyPromise = api('/login/verify', {})
    .then((response) => {
      useSessionModel.getState().setSession(response);
    })
    .catch(() => {
      useSessionModel.getState().clearSession();
    });

  return sessionVerifyPromise;
}

/**
 * 根据路由元信息和服务端确认后的登录态执行客户端跳转守卫。
 *
 * @param meta 当前匹配路由声明的访问控制信息。
 * @returns 校验通过时完成 Promise；不满足访问条件时抛出重定向。
 */
export async function routeGuard(meta: RouteMeta) {
  const hasCachedSession = useSessionModel.getState().isAuthenticated;

  if (meta.auth || (meta.guestOnly && hasCachedSession)) {
    await verifySession();
  }

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
