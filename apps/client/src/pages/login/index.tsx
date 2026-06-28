import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import LucideArrowLeft from '~icons/lucide/arrow-left';
import LucideLockKeyhole from '~icons/lucide/lock-keyhole';
import LucideLogIn from '~icons/lucide/log-in';
import LucideShieldCheck from '~icons/lucide/shield-check';
import LucideUserRound from '~icons/lucide/user-round';

import { api } from '@/utils/api';
import { useSessionModel } from '@/model/session';

/**
 * 渲染客户端登录页。
 *
 * @returns 登录表单页面节点。
 */
export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useSessionModel((state) => state.setSession);
  const [form, setForm] = useState({
    username: '',
    password: '',
  });

  const loginMutation = useMutation({
    mutationFn: (body: typeof form) => api('/login/login', body),
    onSuccess(response) {
      setSession(response);
      void navigate({ to: '/' });
    },
  });

  return (
    <section className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="hidden lg:block">
        <div className="inline-flex h-10 items-center gap-2 rounded border border-primary-soft bg-primary-soft px-3 text-sm font-medium text-primary-2">
          <LucideShieldCheck className="size-4" aria-hidden />
          Client Workspace
        </div>
        <h1 className="mt-6 max-w-xl text-4xl font-semibold text-app-text">
          Deploy control, ready when you are.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-app-muted">
          Secure access for releases, runtime checks, and workspace preferences.
        </p>
        <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
          <div className="rounded border border-app-border bg-app-surface p-4">
            <div className="text-lg font-semibold text-app-text">SPA</div>
            <div className="mt-1 text-xs text-app-muted">Mode</div>
          </div>
          <div className="rounded border border-app-border bg-app-surface p-4">
            <div className="text-lg font-semibold text-success-3">Ready</div>
            <div className="mt-1 text-xs text-app-muted">Status</div>
          </div>
          <div className="rounded border border-app-border bg-app-surface p-4">
            <div className="text-lg font-semibold text-warning-3">Live</div>
            <div className="mt-1 text-xs text-app-muted">API</div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[420px] rounded-lg border border-app-border bg-app-surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-7">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary-3">Welcome back</p>
            <h1 className="mt-2 text-2xl font-semibold text-app-text">Sign In</h1>
            <p className="mt-1 text-sm text-app-muted">Access the client workspace</p>
          </div>
          <div className="inline-flex size-11 shrink-0 items-center justify-center rounded bg-primary-soft text-primary-2">
            <LucideLogIn className="size-5" aria-hidden />
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            loginMutation.mutate(form);
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm text-app-muted">Username</span>
            <div className="relative">
              <LucideUserRound
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-subtle"
                aria-hidden
              />
              <input
                className="h-11 w-full rounded border border-app-border-strong bg-app-bg px-9 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-primary focus:ring-2 focus:ring-primary-soft"
                value={form.username}
                autoComplete="username"
                placeholder="Username"
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    username: event.target.value,
                  }))
                }
              />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-app-muted">Password</span>
            <div className="relative">
              <LucideLockKeyhole
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-subtle"
                aria-hidden
              />
              <input
                className="h-11 w-full rounded border border-app-border-strong bg-app-bg px-9 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-primary focus:ring-2 focus:ring-primary-soft"
                value={form.password}
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    password: event.target.value,
                  }))
                }
              />
            </div>
          </label>

          {loginMutation.error && (
            <div className="rounded border border-error-soft bg-error-soft px-3 py-2 text-sm text-error-3">
              {loginMutation.error.message}
            </div>
          )}

          <button
            type="submit"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded bg-primary px-3 text-sm font-semibold text-app-inverse transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loginMutation.isPending}
          >
            <LucideLogIn className="size-4" aria-hidden />
            {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-2 text-sm text-primary-3 hover:text-primary-2"
        >
          <LucideArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
