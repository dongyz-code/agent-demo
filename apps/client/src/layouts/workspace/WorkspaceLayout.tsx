import { Link } from '@tanstack/react-router';
import {
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  UserCircleIcon,
} from 'lucide-react';

import { Brand } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { api, cn } from '@/utils';
import { routerGoLogin } from '@/router/methods';
import { clearClientSession } from '@/model/session';
import { getWorkspaceNavigation } from './navigation';
import { useAppModel } from '@/model/app';
import { useSessionModel } from '@/model/session';

import { useState, type ReactNode } from 'react';

type WorkspaceLayoutProps = {
  /** 工作区页面主体内容。 */
  children: ReactNode;
};

/**
 * 渲染登录后的工作区布局，导航和边框颜色跟随主题。
 *
 * @param props 工作区页面内容。
 * @returns 工作区布局节点。
 */
export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const navCollapsed = useAppModel((state) => state.navCollapsed);
  const toggleNav = useAppModel((state) => state.toggleNav);
  const user = useSessionModel((state) => state.user);
  const permission = useSessionModel((state) => state.permission);
  const [loggingOut, setLoggingOut] = useState(false);

  /**
   * 调用服务端清除 Cookie，并同步清理客户端会话。
   *
   * @returns 服务端请求、本地清理和登录页跳转完成后结束。
   */
  async function handleLogout() {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);
    try {
      await api('/login/logout', {});
    } catch {
      // 服务端不可用时也要清理本地状态，避免继续使用旧会话。
    } finally {
      clearClientSession();
      await routerGoLogin({ replace: true });
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-20 hidden overflow-hidden border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground transition-[width] duration-200 lg:flex lg:flex-col',
          navCollapsed ? 'w-16' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center px-3',
            navCollapsed ? 'justify-center' : 'justify-start',
          )}
        >
          <Brand collapsed={navCollapsed} />
        </div>
        <TooltipProvider>
          <nav
            aria-label="Workspace navigation"
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 py-2"
          >
            {getWorkspaceNavigation({
              permission,
              sysAdmin: user?.sys_admin,
            }).map(({ icon: Icon, label, to }) => {
              const link = (
                <Button
                  asChild
                  variant="ghost"
                  className={cn(
                    'h-10 w-full justify-start gap-3 rounded-lg px-3 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    navCollapsed && 'justify-center px-2',
                  )}
                >
                  <Link
                    to={to}
                    aria-label={navCollapsed ? label : undefined}
                    activeProps={{
                      className:
                        'bg-sidebar-primary/10 font-medium text-sidebar-primary hover:bg-sidebar-primary/10 hover:text-sidebar-primary',
                    }}
                  >
                    <Icon aria-hidden data-icon="inline-start" />
                    {!navCollapsed && <span>{label}</span>}
                  </Link>
                </Button>
              );

              if (!navCollapsed) {
                return <div key={to}>{link}</div>;
              }

              return (
                <Tooltip key={to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </TooltipProvider>
      </aside>

      <div
        className={cn(
          'min-h-svh transition-[margin] duration-200',
          navCollapsed ? 'lg:ml-16' : 'lg:ml-64',
        )}
      >
        <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleNav}
                aria-label={navCollapsed ? '展开导航' : '折叠导航'}
                title={navCollapsed ? '展开导航' : '折叠导航'}
              >
                {navCollapsed ? (
                  <PanelLeftOpenIcon aria-hidden />
                ) : (
                  <PanelLeftCloseIcon aria-hidden />
                )}
              </Button>
              <div className="lg:hidden">
                <Brand />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden max-w-40 items-center gap-2 truncate text-sm text-muted-foreground sm:flex">
                <UserCircleIcon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">
                  {user?.nickname ?? user?.username ?? '访客'}
                </span>
              </div>
              <Separator
                orientation="vertical"
                className="hidden h-5 sm:block"
              />
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                aria-label="退出登录"
                title="退出登录"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
              >
                <LogOutIcon aria-hidden />
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
