'use client';

import type { PaginationMeta } from '@tanaw/shared';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useBreadcrumbDetail } from './shell-context';

/**
 * The one page-title pattern. `crumbs` marks a detail page: its title becomes the last breadcrumb in the top bar
 * (the section link before it comes from the navigation), so pages don't draw their own breadcrumbs.
 */
export function PageHeader({ title, description, actions, crumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: Array<{ href: string; label: string }> }) {
  useBreadcrumbDetail(crumbs && typeof title === 'string' ? title : null);
  return (
    <header className="mb-5 border-b-[3px] border-black pb-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-display text-[26px] leading-[1.05] font-extrabold text-black sm:text-[34px]">{title}</h1>
          {description && <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-600">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Pagination({ meta, onPage }: { meta: PaginationMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-ink-200 px-5 py-3 text-xs text-ink-600">
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
export function DetailList({ items, single }: { items: Array<[string, ReactNode]>; single?: boolean }) {
  return (
    <dl className={single ? 'grid grid-cols-1 gap-y-4 text-sm' : 'grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2'}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-bold text-black">{k}</dt>
          <dd className="mt-1 break-words text-ink-700">{v ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}
