import type { ReactNode } from 'react';

type StatusBadgeProps = {
  /** 徽标内展示的状态文本或节点。 */
  children: ReactNode;
  /** 徽标语义色，未指定时使用中性样式。 */
  tone?: 'neutral' | 'success' | 'warning';
};

const toneClassName = {
  neutral: 'border-app-border bg-app-raised text-app-muted',
  success: 'border-success-soft bg-success-soft text-success-3',
  warning: 'border-warning-soft bg-warning-soft text-warning-3',
};

/**
 * 渲染跟随主题色的状态徽标。
 *
 * @param props 徽标内容和语义色。
 * @returns 状态徽标节点。
 */
export function StatusBadge({ children, tone = 'neutral' }: StatusBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded border px-2 py-1 text-xs font-medium',
        toneClassName[tone],
      ].join(' ')}
    >
      {children}
    </span>
  );
}
