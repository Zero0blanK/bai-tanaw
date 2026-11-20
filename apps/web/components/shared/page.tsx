import type { PaginationMeta } from '@tanaw/shared';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function PageHeader({ title, description, actions, crumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: Array<{ href: string; label: string }> }) {
  return (
    <header className="mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-500">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" aria-hidden />}
              <Link href={c.href} className="rounded hover:text-brand-700">
                {c.label}
              </Link>
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-ink-900 sm:text-[32px]">{title}</h1>
          {description && <div className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-500">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Pagination({ meta, onPage }: { meta: PaginationMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-ink-100 px-5 py-3 text-xs text-ink-600">
      <span>
        Page {meta.page} of {meta.total_pages}, {meta.total} in total
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={meta.page >= meta.total_pages} onClick={() => onPage(meta.page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Key/value grid for detail pages. */
export function DetailList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-semibold text-ink-500">{k}</dt>
          <dd className="mt-1 break-words text-ink-800">{v ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}
