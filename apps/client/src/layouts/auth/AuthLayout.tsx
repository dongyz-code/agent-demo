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
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_24%,transparent),transparent_42%),linear-gradient(225deg,color-mix(in_oklch,var(--warning)_12%,transparent),transparent_38%),var(--background)] text-foreground before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(color-mix(in_oklch,var(--border)_40%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklch,var(--border)_40%,transparent)_1px,transparent_1px)] before:bg-[length:44px_44px] before:content-[''] before:[mask-image:linear-gradient(to_bottom,black,transparent_72%)]">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Brand />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="relative mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-center px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
