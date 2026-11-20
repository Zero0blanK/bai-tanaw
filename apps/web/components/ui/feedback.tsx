import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const ALERT = {
  error: { cls: 'border-red-200 bg-red-50 text-red-800', Icon: AlertTriangle },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icon: AlertTriangle },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
  info: { cls: 'border-blue-200 bg-blue-50 text-blue-800', Icon: Info },
} as const;

export function Alert({ kind = 'info', children, className }: { kind?: keyof typeof ALERT; children: ReactNode; className?: string }) {
  const { cls, Icon } = ALERT[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
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
      <p className="font-display text-base font-semibold text-ink-800">{title}</p>
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
          <div className="h-3.5 flex-1 animate-pulse rounded bg-ink-100" style={{ maxWidth: `${60 - i * 7}%` }} />
          <div className="h-3.5 w-16 animate-pulse rounded bg-ink-100" />
        </div>
      ))}
    </div>
  );
}
