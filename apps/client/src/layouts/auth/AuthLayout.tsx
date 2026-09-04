import { Brand } from '@/components/Brand';
import { ThemeToggle } from '@/components/ThemeToggle';

import type { ReactNode } from 'react';

type AuthLayoutProps = {
  /** 认证布局内承载的页面内容。 */
  children: ReactNode;
};

/**
 * 渲染认证页面布局，提供主题化背景和品牌栏。
 *
 * @param props 认证页面内容。
 * @returns 认证布局节点。
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100svh-3.5rem)] max-w-6xl items-center px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
