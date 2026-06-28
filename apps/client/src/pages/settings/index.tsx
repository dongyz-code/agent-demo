import LucidePanelLeftClose from '~icons/lucide/panel-left-close';
import LucidePanelLeftOpen from '~icons/lucide/panel-left-open';

import { PageHeader } from '@/components/PageHeader';
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
    <section className="max-w-2xl rounded border border-app-border bg-app-surface p-5">
      <PageHeader title="Settings" description="Client shell preferences" />
      <button
        type="button"
        className="inline-flex h-10 items-center gap-2 rounded bg-primary px-3 text-sm font-medium text-app-inverse hover:bg-primary-hover"
        onClick={toggleNav}
      >
        {navCollapsed ? (
          <LucidePanelLeftOpen className="size-4" aria-hidden />
        ) : (
          <LucidePanelLeftClose className="size-4" aria-hidden />
        )}
        {navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
      </button>
    </section>
  );
}
