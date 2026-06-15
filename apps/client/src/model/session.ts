import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { ApiLogin } from '@repo/types';

type LoginResponse = ApiLogin.LOGIN_RESPONSE;

type SessionState = {
  token: string | null;
  user: LoginResponse['user'] | null;
  permission: LoginResponse['permission'];
  isAuthenticated: boolean;
  setSession: (value: LoginResponse) => void;
  clearSession: () => void;
};

export const useSessionModel = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      permission: [],
      isAuthenticated: false,
      setSession: ({ token, user, permission }) =>
        set({
          token: token ?? null,
          user,
          permission,
          isAuthenticated: true,
        }),
      clearSession: () =>
        set({
          token: null,
          user: null,
          permission: [],
          isAuthenticated: false,
        }),
    }),
    {
      name: 'client-session',
      partialize: ({ token, user, permission, isAuthenticated }) => ({
        token,
        user,
        permission,
        isAuthenticated,
      }),
    },
  ),
);
