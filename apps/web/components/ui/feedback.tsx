import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Editorial notes: a coloured rule on the left, black text, no tinted box (the rule and icon carry the kind). */
const ALERT = {
  error: { cls: 'border-signal', icon: 'text-signal', Icon: AlertTriangle },
  warning: { cls: 'border-amber-500', icon: 'text-amber-600', Icon: AlertTriangle },
  success: { cls: 'border-[var(--color-success-600)]', icon: 'text-[var(--color-success-600)]', Icon: CheckCircle2 },
  info: { cls: 'border-black', icon: 'text-black', Icon: Info },
} as const;

export function Alert({ kind = 'info', children, className }: { kind?: keyof typeof ALERT; children: ReactNode; className?: string }) {
  const { cls, icon, Icon } = ALERT[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('flex gap-2.5 border-l-[3px] bg-ink-50 px-3.5 py-2.5 text-sm leading-relaxed text-ink-800', cls, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-ink-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-base font-bold text-black">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-ink-500">{children}</div>}
    </div>
  );
}

/** Placeholder rows while a list loads, so the layout doesn't jump when data arrives. */
export function SkeletonRows({ rows = 4, label = 'Loading…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-ink-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-3.5 flex-1 animate-pulse rounded-none bg-ink-100" style={{ maxWidth: `${60 - i * 7}%` }} />
          <div className="h-3.5 w-16 animate-pulse rounded-none bg-ink-100" />
        </div>
      ))}
    </div>
  );
}
