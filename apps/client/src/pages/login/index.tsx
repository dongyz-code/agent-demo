import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import LucideArrowLeft from '~icons/lucide/arrow-left';
import LucideLockKeyhole from '~icons/lucide/lock-keyhole';
import LucideLogIn from '~icons/lucide/log-in';
import LucideShieldCheck from '~icons/lucide/shield-check';
import LucideUserRound from '~icons/lucide/user-round';

import { api } from '@/utils/api';
import { useSessionModel } from '@/model/session';
import { routerGoHome } from '@/router/methods';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * 渲染客户端登录页。
 *
 * @returns 登录表单页面节点。
 */
export function LoginPage() {
  const setSession = useSessionModel((state) => state.setSession);
  const [form, setForm] = useState({
    username: '',
    password: '',
  });

  const loginMutation = useMutation({
    mutationFn: (body: typeof form) => api('/login/login', body),
    onSuccess(response) {
      setSession(response);
      void routerGoHome({ replace: true });
    },
  });

  return (
    <section className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="hidden lg:block">
        <div className="inline-flex h-10 items-center gap-2 rounded border border-info/30 bg-info/10 px-3 text-sm font-medium text-info">
          <LucideShieldCheck className="size-4" aria-hidden />
          Client Workspace
        </div>
        <h1 className="mt-6 max-w-xl text-4xl font-semibold text-foreground">
          Workspace control, ready when you are.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          Secure access for runtime checks, user sessions, and workspace
          preferences.
        </p>
        <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
          <div className="rounded border border-border bg-card p-4">
            <div className="text-lg font-semibold text-foreground">SPA</div>
            <div className="mt-1 text-xs text-muted-foreground">Mode</div>
          </div>
          <div className="rounded border border-border bg-card p-4">
            <div className="text-lg font-semibold text-success">Ready</div>
            <div className="mt-1 text-xs text-muted-foreground">Status</div>
          </div>
          <div className="rounded border border-border bg-card p-4">
            <div className="text-lg font-semibold text-warning">Live</div>
            <div className="mt-1 text-xs text-muted-foreground">API</div>
          </div>
        </div>
      </div>

      <Card className="mx-auto w-full max-w-[420px] p-6 sm:p-7">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-link">Welcome back</p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              Sign In
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Access the client workspace
            </p>
          </div>
          <div className="inline-flex size-11 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <LucideLogIn className="size-5" aria-hidden />
          </div>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const username = form.username.trim();

            if (!username || !form.password) {
              return;
            }

            loginMutation.mutate({
              username,
              password: form.password,
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <LucideUserRound
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="username"
                className="pl-9"
                value={form.username}
                name="username"
                required
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
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <LucideLockKeyhole
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="password"
                className="pl-9"
                value={form.password}
                name="password"
                required
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
          </div>

          {loginMutation.error && (
            <Alert variant="destructive">
              <AlertDescription>{loginMutation.error.message}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            className="h-11 w-full text-sm font-semibold"
            disabled={loginMutation.isPending}
          >
            <LucideLogIn className="size-4" aria-hidden />
            {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-2 text-sm text-link hover:text-link/80"
        >
          <LucideArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Link>
      </Card>
    </section>
  );
}
