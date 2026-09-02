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
import { api } from '@/utils/api';
import { routerGoLogin } from '@/router/methods';
import { workspaceNavigation } from './navigation';
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
  const clearSession = useSessionModel((state) => state.clearSession);
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
      clearSession();
      await routerGoLogin({ replace: true });
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside
        className={[
          'fixed inset-y-0 left-0 z-20 hidden border-r border-border bg-background lg:block',
          navCollapsed ? 'w-16' : 'w-64',
        ].join(' ')}
      >
        <div className="flex h-14 items-center border-b border-border px-4">
          <Brand collapsed={navCollapsed} />
        </div>
        <nav className="space-y-1 p-3">
          {workspaceNavigation.map(({ icon: Icon, label, to }) => (
            <Link
              key={to}
              to={to}
              title={navCollapsed ? label : undefined}
              className={[
                'flex h-10 items-center gap-3 rounded px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                '[&.active]:bg-primary/10 [&.active]:text-link',
                navCollapsed ? 'justify-center' : '',
              ].join(' ')}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!navCollapsed && <span>{label}</span>}
            </Link>
          ))}
        </nav>
      </aside>

      <div className={navCollapsed ? 'lg:pl-16' : 'lg:pl-64'}>
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="text-muted-foreground"
                onClick={toggleNav}
                aria-label={
                  navCollapsed ? 'Expand navigation' : 'Collapse navigation'
                }
                title={
                  navCollapsed ? 'Expand navigation' : 'Collapse navigation'
                }
              >
                {navCollapsed ? (
                  <PanelLeftOpenIcon className="size-4" aria-hidden />
                ) : (
                  <PanelLeftCloseIcon className="size-4" aria-hidden />
                )}
              </Button>
              <div className="lg:hidden">
                <Brand />
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <UserCircleIcon className="size-4" aria-hidden />
              <span>{user?.nickname ?? user?.username ?? 'Guest'}</span>
              <ThemeToggle />
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="Sign out"
                title="Sign out"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
              >
                <LogOutIcon className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        </header>
        <main className="px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
