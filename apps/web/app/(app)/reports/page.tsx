'use client';

import { ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page';
import { Card } from '@/components/ui/card';
import { Alert, Empty, SkeletonRows } from '@/components/ui/feedback';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/utils';
import type { Dashboard, Target } from '@/types/api';

/** One target's report readiness, from the same counts the dashboard uses. */
function ReportRow({ target }: { target: Target }) {
  const dash = useApi<Dashboard>('/dashboard', { target_id: target.id });
  const t = dash.data?.totals;
  const inReport = t ? t.open_confirmed + t.fixed : null;
  return (
    <li>
      <Link href={`/reports/${target.id}`} className="group flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-ink-50/70">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-ink-100 text-ink-600">
          <FileText className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink-900 group-hover:text-brand-700">{target.name}</span>
          <span className="block truncate text-xs text-ink-500">{target.base_url}</span>
        </span>
        <dl className="flex gap-6 text-right text-xs">
          <div>
            <dt className="text-ink-500">In report</dt>
            <dd className={cn('font-display text-lg font-semibold tabular-nums', inReport ? 'text-ink-900' : 'text-ink-300')}>{inReport ?? '–'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Still to verify</dt>
            <dd className={cn('font-display text-lg font-semibold tabular-nums', t?.pending_review ? 'text-amber-700' : 'text-ink-300')}>{t?.pending_review ?? '–'}</dd>
          </div>
        </dl>
        <ChevronRight className="h-5 w-5 text-ink-300" aria-hidden />
      </Link>
    </li>
  );
}

export default function ReportsPage() {
  const targets = useApi<Target[]>('/targets');
  return (
    <>
      <PageHeader
        title="Reports"
        description="One security report per target. It holds confirmed and fixed findings only, with evidence, CVSS and remediation, and prints to PDF."
      />
      <Card>
        {targets.loading && !targets.data && <SkeletonRows rows={3} label="Loading reports" />}
        {targets.error && (
          <div className="p-5">
            <Alert kind="error">{targets.error}</Alert>
          </div>
        )}
        {targets.data?.length === 0 && <Empty title="No reports yet">Register a target and confirm findings; its report appears here.</Empty>}
        {targets.data && targets.data.length > 0 && (
          <ul className="divide-y divide-ink-100">
            {targets.data.map((t) => (
              <ReportRow key={t.id} target={t} />
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-xs text-ink-500">Opening a report records a report export in the audit log.</p>
    </>
  );
}
