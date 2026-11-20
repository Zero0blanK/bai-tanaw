import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * An editorial section: a heavy black rule on top, hairlines on the other sides, square corners.
 * Hierarchy comes from the rule and the type, never from shadows.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('border border-t-2 border-ink-200 border-t-black bg-white', className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-4 pt-3 pb-2', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-black">{title}</h2>
        {description && <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

/**
 * A row of key figures separated by vertical rules: the high-signal strip at the top of a page.
 * Each figure is a big tabular number with a short label; the optional `tone` colours only the number.
 */
export function FigureStrip({ items, className }: { items: Array<{ label: string; value: ReactNode; tone?: 'signal' | 'queue' | 'done' | 'muted'; href?: string; note?: string }>; className?: string }) {
  const toneClass = { signal: 'text-signal', queue: 'text-amber-600', done: 'text-[var(--color-success-600)]', muted: 'text-ink-300' } as const;
  return (
    <dl className={cn('grid grid-cols-2 border-y-2 border-black sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]', className)}>
      {items.map((item, i) => {
        const body = (
          <>
            <dt className="text-xs font-semibold text-ink-600">{item.label}</dt>
            <dd className={cn('mt-1 font-display text-3xl font-extrabold tabular-nums leading-none', item.tone ? toneClass[item.tone] : 'text-black')}>{item.value}</dd>
            {item.note && <dd className="mt-1 text-xs text-ink-500">{item.note}</dd>}
          </>
        );
        const cls = cn('block px-4 py-2.5', i > 0 && 'border-l border-ink-200', i >= 2 && 'max-sm:border-t', i === 2 && 'max-sm:border-l-0');
        return item.href ? (
          <a key={item.label} href={item.href} className={cn(cls, 'transition-colors hover:bg-ink-50')}>
            {body}
          </a>
        ) : (
          <div key={item.label} className={cls}>
            {body}
          </div>
        );
      })}
    </dl>
  );
}
