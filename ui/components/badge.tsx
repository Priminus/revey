import type { ReactElement, ReactNode } from 'react';

export type BadgeTone = 'paid' | 'overdue' | 'danger' | 'neutral';

const TONE_CLASS: Record<BadgeTone, string> = {
  paid: 'bg-paid-soft text-paid-deep',
  overdue: 'bg-overdue-soft text-overdue-ink',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-inset text-muted',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps): ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
