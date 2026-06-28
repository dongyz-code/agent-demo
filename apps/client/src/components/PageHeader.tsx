import type { ReactNode } from 'react';

type PageHeaderProps = {
  /** 页面主标题，通常来自路由元信息。 */
  title: string;
  /** 页面辅助说明，缺省时不渲染说明行。 */
  description?: string;
  /** 标题右侧操作区，用于状态徽标或页面按钮。 */
  actions?: ReactNode;
};

/**
 * 渲染页面顶部标题区。
 *
 * @param props 标题、说明和操作区内容。
 * @returns 页面标题节点。
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-app-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-app-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
