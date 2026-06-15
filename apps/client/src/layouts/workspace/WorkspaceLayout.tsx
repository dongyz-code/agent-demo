import { Link } from '@tanstack/react-router';
import LucidePanelLeftClose from '~icons/lucide/panel-left-close';
import LucidePanelLeftOpen from '~icons/lucide/panel-left-open';
import LucideUserCircle from '~icons/lucide/user-circle';

import { Brand } from '@/components/Brand';
import { workspaceNavigation } from './navigation';
import { useAppModel } from '@/model/app';
import { useSessionModel } from '@/model/session';

import type { ReactNode } from 'react';

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const navCollapsed = useAppModel((state) => state.navCollapsed);
  const toggleNav = useAppModel((state) => state.toggleNav);
  const user = useSessionModel((state) => state.user);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <aside
        className={[
          'fixed inset-y-0 left-0 z-20 hidden border-r border-zinc-800 bg-zinc-950/95 lg:block',
          navCollapsed ? 'w-16' : 'w-64',
        ].join(' ')}
      >
        <div className="flex h-14 items-center border-b border-zinc-800 px-4">
          <Brand collapsed={navCollapsed} />
        </div>
        <nav className="space-y-1 p-3">
          {workspaceNavigation.map(({ icon: Icon, label, to }) => (
            <Link
              key={to}
              to={to}
              title={navCollapsed ? label : undefined}
              className={[
                'flex h-10 items-center gap-3 rounded px-3 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white',
                '[&.active]:bg-emerald-500/15 [&.active]:text-emerald-200',
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
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-900"
                onClick={toggleNav}
                aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              >
                {navCollapsed ? (
                  <LucidePanelLeftOpen className="size-4" aria-hidden />
                ) : (
                  <LucidePanelLeftClose className="size-4" aria-hidden />
                )}
              </button>
              <div className="lg:hidden">
                <Brand />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <LucideUserCircle className="size-4" aria-hidden />
              <span>{user?.nickname ?? user?.username ?? 'Guest'}</span>
            </div>
          </div>
        </header>
        <main className="px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
