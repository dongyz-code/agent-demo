import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useAppModel } from '@/model/app';

/**
 * 渲染客户端设置页。
 *
 * @returns 设置页面节点。
 */
export function SettingsPage() {
  const navCollapsed = useAppModel((state) => state.navCollapsed);
  const toggleNav = useAppModel((state) => state.toggleNav);

  return (
    <section className="max-w-2xl rounded border border-border bg-card p-5">
      <PageHeader title="设置" description="工作台偏好" />
      <Button onClick={toggleNav}>
        {navCollapsed ? (
          <PanelLeftOpenIcon className="size-4" aria-hidden />
        ) : (
          <PanelLeftCloseIcon className="size-4" aria-hidden />
        )}
        {navCollapsed ? '展开导航' : '折叠导航'}
      </Button>
    </section>
  );
}
