import { useQuery } from '@tanstack/react-query';
import LucideClock3 from '~icons/lucide/clock-3';
import LucideServer from '~icons/lucide/server';
import LucideShieldCheck from '~icons/lucide/shield-check';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

import type { IconComponent } from '@/router/type';

function useRuntimeSummary() {
  return useQuery({
    queryKey: ['runtime-summary'],
    queryFn: async () => ({
      status: 'ready',
      checkedAt: new Date().toLocaleTimeString(),
    }),
  });
}

export function DashboardPage() {
  const { data } = useRuntimeSummary();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Client application workspace"
        actions={<StatusBadge tone="success">{data?.status ?? 'loading'}</StatusBadge>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="rounded border border-zinc-800 bg-zinc-900 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard icon={LucideServer} label="API" value="/api" />
            <MetricCard icon={LucideShieldCheck} label="Mode" value="SPA" />
            <MetricCard icon={LucideClock3} label="Checked" value={data?.checkedAt ?? '-'} />
          </div>
        </section>
        <aside className="rounded border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-semibold uppercase text-zinc-400">Stack</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {['React 19', 'Vite 8', 'TypeScript', 'TanStack', 'Tailwind'].map(
              (item) => (
                <StatusBadge key={item}>{item}</StatusBadge>
              ),
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

type MetricCardProps = {
  icon: IconComponent;
  label: string;
  value: string;
};

function MetricCard({ icon: Icon, label, value }: MetricCardProps) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
      <Icon className="mb-3 size-5 text-emerald-300" aria-hidden />
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-1 font-medium text-zinc-100">{value}</div>
    </div>
  );
}
