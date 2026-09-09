import { ThemeToggle } from '@/components/ThemeToggle';
import { useSessionModel } from '@/model';

/**
 * 渲染工作台设置页：账户信息与外观主题切换。
 *
 * @returns 设置页面节点。
 */
export default function SettingsPage() {
  const user = useSessionModel((state) => state.user);
  const displayName = user?.nickname ?? user?.username ?? '访客';

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-xl font-semibold text-foreground">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">工作台偏好</p>

        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">账户</h2>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">当前用户</span>
            <span className="text-foreground">{displayName}</span>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">外观</h2>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">主题</span>
            <ThemeToggle />
          </div>
        </section>
      </div>
    </div>
  );
}
