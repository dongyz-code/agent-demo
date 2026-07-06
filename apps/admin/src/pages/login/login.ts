import { useStore } from '@/models';
import { routerGo } from '@/router';

import type { ApiLogin } from '@/types';

export function logoutHandle() {
  const store = useStore();
  store.stateSet({
    permission: [],
    user: null,
  });
  localStorage.removeItem('token');
}

export function loginHandle({ permission, token, user }: ApiLogin.LOGIN_RESPONSE) {
  const store = useStore();
  store.stateSet({ permission, user });
  if (token) {
    localStorage.setItem('token', token);
  }
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
