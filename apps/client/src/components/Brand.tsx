import LucideActivity from '~icons/lucide/activity';

type BrandProps = {
  /** 折叠模式下仅展示图标，用于侧边栏窄态。 */
  collapsed?: boolean;
};

/**
 * 展示客户端品牌入口，颜色跟随当前主题主色。
 *
 * @param props 品牌展示参数。
 * @returns 品牌标识节点。
 */
export function Brand({ collapsed = false }: BrandProps) {
  return (
    <div className="flex items-center gap-2 font-semibold text-app-text">
      <LucideActivity className="size-5 text-primary-3" aria-hidden />
      {!collapsed && <span>Client</span>}
    </div>
  );
}
