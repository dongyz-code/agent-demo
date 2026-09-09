import { useLocation } from '@tanstack/react-router';
import { MenuIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ThemeToggle } from '@/components/ThemeToggle';
import { Button, Sheet, SheetContent, SheetTitle } from '@/components/ui';
import { useAppModel } from '@/model';
import { cn } from '@/utils';

import { ConversationSidebar } from './ConversationSidebar';
import { UserMenu } from './UserMenu';

type WorkspaceLayoutProps = {
  /** 工作区页面主体内容。 */
  children: ReactNode;
};

/**
 * 渲染登录后的对话式工作区：左会话栏 + 右顶栏与内容区，导航与配色跟随主题。
 *
 * @param props 工作区页面内容。
 * @returns 工作区布局节点。
 */
export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const navCollapsed = useAppModel((state) => state.navCollapsed);
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();

  // 路由变化后关闭移动端抽屉，避免导航后仍遮挡内容。
  useEffect(() => {
    setSheetOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex lg:flex-col',
          navCollapsed ? 'w-16' : 'w-64',
        )}
      >
        <ConversationSidebar collapsed={navCollapsed} />
      </aside>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-64 p-0"
        >
          <SheetTitle className="sr-only">导航</SheetTitle>
          <ConversationSidebar />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSheetOpen(true)}
            aria-label="打开导航"
          >
            <MenuIcon className="size-4" aria-hidden />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
          <UserMenu />
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
