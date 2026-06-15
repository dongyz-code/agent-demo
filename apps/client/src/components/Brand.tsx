import LucideActivity from '~icons/lucide/activity';

type BrandProps = {
  collapsed?: boolean;
};

export function Brand({ collapsed = false }: BrandProps) {
  return (
    <div className="flex items-center gap-2 font-semibold text-white">
      <LucideActivity className="size-5 text-emerald-400" aria-hidden />
      {!collapsed && <span>Client</span>}
    </div>
  );
}
