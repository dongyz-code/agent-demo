import { useStore } from '@/store';

import type { ApiLogin } from '@/types';

export function logoutHandle() {
  const store = useStore();
  store.stateSet({
    user: null,
    permission: [],
  });
  localStorage.removeItem('token');
}

export function loginHandle({
  user,
  token,
  permission,
}: ApiLogin.LOGIN_RESPONSE) {
  const store = useStore();
  store.stateSet({ user, permission });
  if (token) {
    localStorage.setItem('token', token);
  }
}
