import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A white surface on the paper background. Hierarchy comes from spacing and type, not shadows. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('rounded-xl border border-ink-200/70 bg-white', className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3', className)}>
      <div className="min-w-0">
        <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink-900">{title}</h2>
        {description && <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}
