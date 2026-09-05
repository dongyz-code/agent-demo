import { create } from 'zustand';

import type { ApiLogin } from '@repo/types';

import { queryClient } from '@/query-client';

/** 登录和会话校验接口返回的内存 DTO。 */
type LoginResponse = ApiLogin.LOGIN_RESPONSE;

/** 客户端会话生命周期；只有 authenticated 状态代表 Cookie 已确认有效。 */
export type SessionStatus =
  | 'unknown'
  | 'checking'
  | 'authenticated'
  | 'anonymous';

type SessionSnapshot =
  | {
      /** 尚未开始读取 Cookie 会话。 */
      status: 'unknown';
      /** 未认证状态不保留用户身份。 */
      user: null;
      /** 未认证状态不保留权限。 */
      permission: [];
    }
  | {
      /** 正在读取 Cookie 会话。 */
      status: 'checking';
      /** 校验期间不使用过期用户资料。 */
      user: null;
      /** 校验期间不使用过期权限。 */
      permission: [];
    }
  | {
      /** Cookie 已被服务端确认有效。 */
      status: 'authenticated';
      /** 服务端确认的当前用户。 */
      user: LoginResponse['user'];
      /** 服务端确认的当前权限。 */
      permission: LoginResponse['permission'];
    }
  | {
      /** 服务端明确表示当前没有有效会话。 */
      status: 'anonymous';
      /** 未认证状态不保留用户身份。 */
      user: null;
      /** 未认证状态不保留权限。 */
      permission: [];
    };

type SessionState = SessionSnapshot & {
  /** 将会话置为校验中。 */
  startChecking: () => void;
  /** 使用服务端登录或校验结果建立内存会话。 */
  setSession: (value: LoginResponse) => void;
  /** 清理会话并标记为明确未认证。 */
  clearSession: () => void;
  /** 网络故障时回到未知状态，允许后续重新校验。 */
  resetSession: () => void;
};

/** 会话失效版本，防止并发校验结果覆盖已经清理的会话。 */
let sessionEpoch = 0;

/**
 * 读取当前会话失效版本。
 *
 * @returns 当前版本号。
 */
export function getSessionEpoch() {
  return sessionEpoch;
}

export const useSessionModel = create<SessionState>()((set) => ({
  status: 'unknown',
  user: null,
  permission: [],
  startChecking: () =>
    set((state) => {
      if (state.status !== 'unknown') {
        return state;
      }
      return { status: 'checking', user: null, permission: [] };
    }),
  setSession: ({ user, permission }) => {
    sessionEpoch += 1;
    set({
      status: 'authenticated',
      user,
      permission,
    });
  },
  clearSession: () => {
    set((state) => {
      if (
        state.status === 'anonymous' &&
        state.user === null &&
        state.permission.length === 0
      ) {
        return state;
      }
      sessionEpoch += 1;
      return {
        status: 'anonymous',
        user: null,
        permission: [],
      };
    });
  },
  resetSession: () => {
    sessionEpoch += 1;
    set({
      status: 'unknown',
      user: null,
      permission: [],
    });
  },
}));

/** 认证失效后执行路由刷新与登录页替换的注入函数。 */
type AuthNavigation = (epoch: number) => Promise<void>;

/** 路由层注入的认证失效后的导航实现，避免请求模块依赖 router。 */
let authNavigation: AuthNavigation | undefined;
let unauthorizedPromise: Promise<void> | undefined;

/**
 * 注册认证失效后的路由处理器。
 *
 * @param navigate 清理路由状态并替换到登录页的异步函数。
 */
export function configureAuthLifecycle(navigate: AuthNavigation) {
  authNavigation = navigate;
}

/**
 * 统一清理浏览器端用户作用域状态，并合并并发的 401 导航。
 *
 * @param expectedEpoch 请求发出时的会话版本；旧请求的 401 会被忽略。
 */
export function handleUnauthorized(expectedEpoch?: number) {
  if (expectedEpoch !== undefined && getSessionEpoch() !== expectedEpoch) {
    return Promise.resolve();
  }

  if (unauthorizedPromise) {
    return unauthorizedPromise;
  }

  useSessionModel.getState().clearSession();
  queryClient.clear();
  const epoch = getSessionEpoch();
  unauthorizedPromise = (async () => {
    try {
      await authNavigation?.(epoch);
    } catch {
      // 认证失效清理必须保持幂等，路由当前正在跳转时忽略导航竞争。
    }
  })().finally(() => {
    unauthorizedPromise = undefined;
  });

  return unauthorizedPromise;
}

/** 主动退出时复用的本地清理原语。 */
export function clearClientSession() {
  useSessionModel.getState().clearSession();
  queryClient.clear();
}
