import { redirect } from '@tanstack/react-router';
import { AxiosError } from 'axios';

import { ApiResponseError, api } from '@/utils';
import { getSessionEpoch, useSessionModel } from '@/model/session';
import { routePathMap } from './routes';
import { canAccessClientRoute } from './permission';

import type { RouteMeta } from './type';

/** 当前仅合并正在执行的会话校验请求，完成后必须释放。 */
let sessionVerifyPromise: Promise<void> | undefined;

/**
 * 通过 HttpOnly Cookie 校验当前会话。
 *
 * @returns 校验完成后的 Promise；非 401 错误会继续向路由层抛出。
 */
async function verifySession(): Promise<void> {
  if (sessionVerifyPromise) {
    return sessionVerifyPromise;
  }

  const epoch = getSessionEpoch();
  useSessionModel.getState().startChecking();
  sessionVerifyPromise = api('/login/verify', {})
    .then((response) => {
      if (getSessionEpoch() === epoch) {
        useSessionModel.getState().setSession(response);
      }
    })
    .catch((error: unknown) => {
      /** 旧校验请求的结果不得覆盖之后已经建立的新会话。 */
      if (getSessionEpoch() !== epoch) {
        return;
      }
      if (
        (error instanceof ApiResponseError && error.code === '401') ||
        (error instanceof AxiosError && error.response?.status === 401)
      ) {
        useSessionModel.getState().clearSession();
        return;
      }
      useSessionModel.getState().resetSession();
      throw error;
    })
    .finally(() => {
      sessionVerifyPromise = undefined;
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
  const status = useSessionModel.getState().status;
  if (
    (meta.auth || meta.guestOnly) &&
    (status === 'unknown' || status === 'checking')
  ) {
    await verifySession();
  }

  const {
    status: currentStatus,
    permission,
    user,
  } = useSessionModel.getState();
  const isAuthenticated = currentStatus === 'authenticated';

  if (meta.guestOnly && isAuthenticated) {
    throw redirect({ to: routePathMap.dashboard });
  }

  if (meta.auth && !isAuthenticated) {
    throw redirect({ to: routePathMap.login });
  }

  if (
    !canAccessClientRoute({
      permissions: meta.permissions,
      permission,
      sysAdmin: user?.sys_admin,
    })
  ) {
    throw redirect({ to: routePathMap.notFound });
  }
}
