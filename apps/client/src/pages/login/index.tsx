import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import LucideLogIn from '~icons/lucide/log-in';

import { api } from '@/utils/api';
import { useSessionModel } from '@/model/session';

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
    <section className="mx-auto w-full max-w-md rounded border border-zinc-800 bg-zinc-900 p-6">
      <div className="mb-6">
        <div className="mb-3 inline-flex size-10 items-center justify-center rounded bg-emerald-500/15 text-emerald-300">
          <LucideLogIn className="size-5" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-white">Sign In</h1>
        <p className="mt-1 text-sm text-zinc-400">Access the client workspace</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          loginMutation.mutate(form);
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Username</span>
          <input
            className="h-10 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-emerald-400"
            value={form.username}
            autoComplete="username"
            onChange={(event) =>
              setForm((value) => ({
                ...value,
                username: event.target.value,
              }))
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Password</span>
          <input
            className="h-10 w-full rounded border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none focus:border-emerald-400"
            value={form.password}
            type="password"
            autoComplete="current-password"
            onChange={(event) =>
              setForm((value) => ({
                ...value,
                password: event.target.value,
              }))
            }
          />
        </label>

        {loginMutation.error && (
          <div className="rounded border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {loginMutation.error.message}
          </div>
        )}

        <button
          type="submit"
          className="inline-flex h-10 w-full items-center justify-center rounded bg-emerald-500 px-3 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <Link
        to="/"
        className="mt-4 inline-flex text-sm text-emerald-300 hover:text-emerald-200"
      >
        Back to dashboard
      </Link>
    </section>
  );
}
