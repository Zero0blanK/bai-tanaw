'use client';

import { FINDING_CATEGORIES, FINDING_SOURCES, FINDING_STATUSES, SCAN_STATUSES, SEVERITIES, type Severity } from '@tanaw/shared';
import Link from 'next/link';
import { useState } from 'react';
import { HBarChart, type BarDatum } from '@/components/shared/bar-chart';
import { CATEGORY_LABEL, SOURCE_LABEL } from '@/components/shared/badges';
import { PageHeader } from '@/components/shared/page';
import { Alert, Spinner } from '@/components/ui/feedback';
import { Label, Select } from '@/components/ui/form';
import { useApi } from '@/hooks/useApi';
import { humanize } from '@/lib/utils';
import type { Counts, Dashboard, Target } from '@/types/api';

/** Severity is ordinal, so it gets one hue from light (INFO) to dark (CRITICAL); labels name each bar. */
const SEVERITY_RAMP: Record<Severity, string> = {
  CRITICAL: '#7f1d1d',
  HIGH: '#b91c1c',
  MEDIUM: '#dc2626',
  LOW: '#f87171',
  INFO: '#fca5a5',
};

function bars<T extends string>(counts: Counts, keys: readonly T[], label: (k: T) => string = humanize, color?: (k: T) => string): BarDatum[] {
  return keys.map((k) => ({ label: label(k), value: counts[k] ?? 0, ...(color ? { color: color(k) } : {}) }));
}

function Stat({ label, value, href, tone }: { label: string; value: number; href: string; tone: string }) {
  return (
    <Link href={href} className="group rounded-xl px-1 py-1">
      <p className="text-[13px] font-semibold text-ink-500 group-hover:text-ink-800">{label}</p>
      <p className={`mt-1 font-display text-3xl font-semibold tabular-nums ${value > 0 ? tone : 'text-ink-300'}`}>{value}</p>
    </Link>
  );
}

/** The one number that asks for action leads the page; the rest are context. */
function Lead({ pending, href }: { pending: number; href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-6 py-5">
      <div className="flex items-baseline gap-4">
        <span className="font-display text-5xl font-semibold tabular-nums text-amber-700">{pending}</span>
        <span className="max-w-sm text-[15px] leading-snug text-ink-700">
          {pending === 1 ? 'finding is' : 'findings are'} waiting for an assessor to confirm or dismiss
        </span>
      </div>
      {pending > 0 && (
        <Link href={href} className="inline-flex h-10 items-center rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-ink-800">
          Review findings
        </Link>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const targets = useApi<Target[]>('/targets');
  const [targetId, setTargetId] = useState('');
  const dash = useApi<Dashboard>('/dashboard', { target_id: targetId });
  const q = targetId ? `target_id=${targetId}&` : '';

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where the assessment stands. Only confirmed findings count toward real severity."
        actions={
          <div className="w-64">
            <Label htmlFor="dash-target" className="sr-only">
              Target
            </Label>
            <Select id="dash-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">All targets</option>
              {targets.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      {dash.error && <Alert kind="error">{dash.error}</Alert>}
      {dash.loading && !dash.data && <Spinner />}
      {dash.data && (
        <div className="space-y-6">
          <Lead pending={dash.data.totals.pending_review} href={`/findings?${q}status=PENDING`} />
          <div className="grid grid-cols-3 gap-6 border-b border-ink-200 pb-6">
            <Stat label="Confirmed, still open" value={dash.data.totals.open_confirmed} href={`/findings?${q}status=CONFIRMED`} tone="text-red-700" />
            <Stat label="Fixed" value={dash.data.totals.fixed} href={`/findings?${q}status=FIXED`} tone="text-brand-700" />
            <Stat label="All findings" value={dash.data.totals.findings} href={`/findings${targetId ? `?target_id=${targetId}` : ''}`} tone="text-ink-900" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <HBarChart
              title="Confirmed findings by severity"
              description="Final severity set by an assessor."
              data={bars(dash.data.findings.confirmed_by_severity, SEVERITIES, humanize, (s) => SEVERITY_RAMP[s])}
              emptyText="No confirmed findings yet"
            />
            <HBarChart
              title="Waiting findings by suggested severity"
              description="Suggested by tool rules or the AI. Not verified yet."
              data={bars(dash.data.findings.pending_by_ai_severity, SEVERITIES, humanize, (s) => SEVERITY_RAMP[s])}
              emptyText="Nothing waiting for review"
            />
          </div>
          <h2 className="pt-2 font-display text-lg font-semibold text-ink-900">Breakdown</h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <HBarChart title="Findings by status" data={bars(dash.data.findings.by_status, FINDING_STATUSES)} />
            <HBarChart title="Findings by category" data={bars(dash.data.findings.by_category, FINDING_CATEGORIES, (c) => CATEGORY_LABEL[c])} />
            <HBarChart title="Findings by source" data={bars(dash.data.findings.by_source, FINDING_SOURCES, (k) => SOURCE_LABEL[k])} />
            <HBarChart title="Scans by status" data={bars(dash.data.scans.by_status, SCAN_STATUSES)} emptyText="No scans yet" />
          </div>
        </div>
      )}
    </>
  );
}
