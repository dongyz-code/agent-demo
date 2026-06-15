import { Brand } from '@/components/Brand';

import type { ReactNode } from 'react';

type AuthLayoutProps = {
  children: ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Brand />
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-center px-4 py-8">
        {children}
      </main>
    </div>
  );
}
