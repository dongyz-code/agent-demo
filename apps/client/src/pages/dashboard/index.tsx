import { useQuery } from '@tanstack/react-query';
import { Clock3Icon, ServerIcon, ShieldCheckIcon } from 'lucide-react';

import type { IconComponent } from '@/router';

import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui';

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
    <div className="rounded border border-border bg-background p-4">
      <Icon className="mb-3 size-5 text-primary" aria-hidden />
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </div>
  );
}

/**
 * 渲染客户端仪表盘首页。
 *
 * @returns 仪表盘页面节点。
 */
export default function DashboardPage() {
  const { data } = useRuntimeSummary();

  return (
    <>
      <PageHeader
        title="工作台"
        description="Agent 工作台概览"
        actions={<Badge variant="success">{data?.status ?? 'loading'}</Badge>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <section className="rounded border border-border bg-card p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard icon={ServerIcon} label="API" value="/api" />
            <MetricCard icon={ShieldCheckIcon} label="Mode" value="SPA" />
            <MetricCard
              icon={Clock3Icon}
              label="Checked"
              value={data?.checkedAt ?? '-'}
            />
          </div>
        </section>
        <aside className="rounded border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Stack
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {['React 19', 'Vite 8', 'TypeScript', 'TanStack', 'Tailwind'].map(
              (item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ),
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
