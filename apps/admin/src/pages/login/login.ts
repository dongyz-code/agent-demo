import { useStore } from '@/models';
import { routerGo } from '@/router';

import type { ApiLogin } from '@/types';

/** 清理管理端内存会话；认证 Cookie 由服务端 logout 接口负责清除。 */
export function logoutHandle() {
  const store = useStore();
  store.stateSet({
    permission: [],
    user: null,
  });
}

/** 将登录响应中的用户与共享权限同步到管理端内存状态。 */
export function loginHandle({ permission, user }: ApiLogin.LOGIN_RESPONSE) {
  const store = useStore();
  store.stateSet({ permission, user });
}

export function loginHandleRedirect(
  info: ApiLogin.LOGIN_RESPONSE,
  redirect?: string | null,
) {
  loginHandle(info);
  if (redirect) {
    location.href = redirect;
  } else {
    routerGo();
  }
}
