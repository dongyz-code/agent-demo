import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  LockKeyholeIcon,
  LogInIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from 'lucide-react';

import { api, message } from '@/utils';
import { useSessionModel } from '@/model/session';
import { routerGoHome } from '@/router/methods';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

/** 登录接口提交所需的凭据字段。 */
type LoginFormValues = {
  username: string;
  password: string;
};

/**
 * 渲染客户端登录页。
 *
 * @returns 登录表单页面节点。
 */
export function LoginPage() {
  const setSession = useSessionModel((state) => state.setSession);
  const form = useForm<LoginFormValues>({
    defaultValues: {
      username: '',
      password: '',
    },
  });
  const username = form.watch('username');
  const password = form.watch('password');

  const loginMutation = useMutation({
    mutationFn: (body: LoginFormValues) => api('/login/login', body),
    onSuccess(response) {
      setSession(response);
      void routerGoHome({ replace: true });
    },
    /** 登录失败时使用全局消息提示，避免把接口错误混入字段校验区域。 */
    onError(error) {
      message.error(error.message);
    },
  });

  /** 提交登录凭据；字段不完整时由按钮禁用，函数内保留兜底判断。 */
  function handleSubmit(values: LoginFormValues) {
    const username = values.username.trim();
    if (!username || !values.password) {
      return;
    }

    loginMutation.mutate({ username, password: values.password });
  }

  return (
    <section className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div className="hidden lg:block">
        <div className="inline-flex h-10 items-center gap-2 rounded border border-info/30 bg-info-subtle px-3 text-sm font-medium text-info">
          <ShieldCheckIcon className="size-4" aria-hidden />
          Agent 工作台
        </div>
        <h1 className="mt-6 max-w-xl text-4xl font-semibold text-foreground">
          构建、运行与管理你的 Agent
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          登录后即可编排 Agent、管理会话与运行时任务。
        </p>
        <div className="mt-8 grid max-w-xl grid-cols-3 gap-3">
          <div className="rounded border border-border bg-card p-4">
            <div className="text-lg font-semibold text-foreground">构建</div>
            <div className="mt-1 text-xs text-muted-foreground">可视化编排</div>
          </div>
          <div className="rounded border border-border bg-card p-4">
            <div className="text-lg font-semibold text-success">运行</div>
            <div className="mt-1 text-xs text-muted-foreground">实时任务调度</div>
          </div>
          <div className="rounded border border-border bg-card p-4">
            <div className="text-lg font-semibold text-warning">管理</div>
            <div className="mt-1 text-xs text-muted-foreground">会话与配置</div>
          </div>
        </div>
      </div>

      <Card className="mx-auto w-full max-w-105 p-6 sm:p-7">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-link">欢迎回来</p>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              登录
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              请输入账号信息以继续
            </p>
          </div>
          <div className="inline-flex size-11 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <LogInIcon className="size-5" aria-hidden />
          </div>
        </div>

        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <div className="relative">
                    <UserRoundIcon
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <FormControl>
                      <Input
                        {...field}
                        className="pl-9"
                        autoComplete="username"
                        placeholder="用户名"
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密码</FormLabel>
                  <div className="relative">
                    <LockKeyholeIcon
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <FormControl>
                      <PasswordInput
                        {...field}
                        className="pl-9"
                        autoComplete="current-password"
                        placeholder="密码"
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="h-11 w-full text-sm font-semibold"
              disabled={
                loginMutation.isPending || !username.trim() || !password
              }
            >
              <LogInIcon aria-hidden data-icon="inline-start" />
              {loginMutation.isPending ? '登录中…' : '登录'}
            </Button>
          </form>
        </Form>
      </Card>
    </section>
  );
}
