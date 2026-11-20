'use client';

import { FINDING_CATEGORIES, FINDING_SOURCES, FINDING_STATUSES, SCAN_STATUSES, SEVERITIES, type Severity } from '@tanaw/shared';
import { Bug, ChevronRight, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { HBarChart, type BarDatum } from '@/components/shared/bar-chart';
import { useAuth } from '@/components/shared/auth-provider';
import { CATEGORY_LABEL, FindingStatusBadge, SEVERITY_COLOR, SOURCE_LABEL } from '@/components/shared/badges';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/page';
import { Alert, Empty, SkeletonRows, Spinner } from '@/components/ui/feedback';
import { Label, Select } from '@/components/ui/form';
import { useApi } from '@/hooks/useApi';
import { formatDate, humanize } from '@/lib/utils';
import type { Counts, Dashboard, Finding, Target } from '@/types/api';

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

/** The latest findings, newest first, so the dashboard shows what changed without opening Findings. */
function RecentFindings({ targetId }: { targetId: string }) {
  const recent = useApi<Finding[]>('/findings', { target_id: targetId, limit: 6 });
  return (
    <Card>
      <CardHeader
        title="Recent findings"
        actions={
          <Link href={`/findings${targetId ? `?target_id=${targetId}` : ''}`} className="text-sm font-semibold text-brand-700 hover:underline">
            View all
          </Link>
        }
      />
      {recent.loading && !recent.data && <SkeletonRows rows={4} label="Loading recent findings" />}
      {recent.error && (
        <CardBody>
          <Alert kind="error">{recent.error}</Alert>
        </CardBody>
      )}
      {recent.data?.length === 0 && <Empty title="No findings yet">Run an assessment from a target page.</Empty>}
      {recent.data && recent.data.length > 0 && (
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {recent.data.map((f) => {
            const severity = f.final_severity ?? f.ai_severity;
            return (
              <li key={f.id}>
                <Link href={`/findings/${f.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-50/70">
                  <span aria-hidden className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: severity ? SEVERITY_COLOR[severity] : 'var(--color-ink-200)' }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">{f.title}</span>
                    <span className="block truncate text-xs text-ink-500">
                      {f.target?.name}, {formatDate(f.created_at)}
                    </span>
                  </span>
                  <FindingStatusBadge status={f.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The few things people come to the dashboard to do next. Links only; each lands on a working page. */
function QuickActions({ canAssess, pendingHref }: { canAssess: boolean; pendingHref: string }) {
  const actions = [
    { href: pendingHref, label: 'Review waiting findings', help: 'Confirm, reject or mark false positive', icon: Bug, show: true },
    { href: '/targets', label: 'Run an assessment', help: 'Pick a target and run every tool', icon: ShieldCheck, show: canAssess },
    { href: '/reports', label: 'Open a report', help: 'Confirmed and fixed findings, ready to print', icon: FileText, show: true },
  ].filter((a) => a.show);
  return (
    <Card>
      <CardHeader title="Quick actions" />
      <ul className="space-y-1 px-3 pb-3">
        {actions.map(({ href, label, help, icon: Icon }) => (
          <li key={label}>
            <Link href={href} className="group flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-2.5 transition-colors hover:bg-ink-50">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] bg-brand-50 text-brand-700">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-900 group-hover:text-brand-700">{label}</span>
                <span className="block text-xs text-ink-500">{help}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-ink-300" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function DashboardPage() {
  const { can } = useAuth();
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            <RecentFindings targetId={targetId} />
            <QuickActions canAssess={can('ADMIN', 'ASSESSOR')} pendingHref={`/findings?${q}status=PENDING`} />
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
