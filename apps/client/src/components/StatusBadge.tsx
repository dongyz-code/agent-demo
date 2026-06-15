import type { ReactNode } from 'react';

type StatusBadgeProps = {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning';
};

const toneClassName = {
  neutral: 'border-zinc-700 bg-zinc-900 text-zinc-300',
  success: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-200',
  warning: 'border-amber-400/25 bg-amber-500/15 text-amber-200',
};

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
