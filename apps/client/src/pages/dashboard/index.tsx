import { useQuery } from '@tanstack/react-query';
import LucideClock3 from '~icons/lucide/clock-3';
import LucideServer from '~icons/lucide/server';
import LucideShieldCheck from '~icons/lucide/shield-check';

import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';

import type { IconComponent } from '@/router/type';

/**
 * 获取客户端运行概览，用于仪表盘展示当前工作区状态。
 *
 * @returns React Query 运行概览查询结果。
 */
function useRuntimeSummary() {
  return useQuery({
    queryKey: ['runtime-summary'],
    queryFn: async () => ({
      status: 'ready',
      checkedAt: new Date().toLocaleTimeString(),
    }),
  });
}

/**
 * 渲染客户端仪表盘首页。
 *
 * @returns 仪表盘页面节点。
 */
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
        <section className="rounded border border-app-border bg-app-surface p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard icon={LucideServer} label="API" value="/api" />
            <MetricCard icon={LucideShieldCheck} label="Mode" value="SPA" />
            <MetricCard icon={LucideClock3} label="Checked" value={data?.checkedAt ?? '-'} />
          </div>
        </section>
        <aside className="rounded border border-app-border bg-app-surface p-5">
          <h2 className="text-sm font-semibold uppercase text-app-muted">Stack</h2>
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
  /** 指标卡片左上角图标。 */
  icon: IconComponent;
  /** 指标名称。 */
  label: string;
  /** 指标当前值。 */
  value: string;
};

/**
 * 渲染仪表盘指标卡片。
 *
 * @param props 图标、标签和值。
 * @returns 指标卡片节点。
 */
function MetricCard({ icon: Icon, label, value }: MetricCardProps) {
  return (
    <div className="rounded border border-app-border bg-app-bg p-4">
      <Icon className="mb-3 size-5 text-primary-3" aria-hidden />
      <div className="text-sm text-app-muted">{label}</div>
      <div className="mt-1 font-medium text-app-text">{value}</div>
    </div>
  );
}
