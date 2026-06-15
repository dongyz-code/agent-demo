import LucidePanelLeftClose from '~icons/lucide/panel-left-close';
import LucidePanelLeftOpen from '~icons/lucide/panel-left-open';

import { PageHeader } from '@/components/PageHeader';
import { useAppModel } from '@/model/app';

export function SettingsPage() {
  const navCollapsed = useAppModel((state) => state.navCollapsed);
  const toggleNav = useAppModel((state) => state.toggleNav);

  return (
    <section className="max-w-2xl rounded border border-zinc-800 bg-zinc-900 p-5">
      <PageHeader title="Settings" description="Client shell preferences" />
      <button
        type="button"
        className="inline-flex h-10 items-center gap-2 rounded bg-emerald-500 px-3 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
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
