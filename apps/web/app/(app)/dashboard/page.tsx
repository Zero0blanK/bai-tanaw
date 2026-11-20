'use client';

import { FINDING_CATEGORIES, FINDING_SOURCES, FINDING_STATUSES, SCAN_STATUSES, SEVERITIES, type Severity } from '@tanaw/shared';
import { ArrowRight, FileText, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { SEVERITY_COLOR, SeverityBadge, SOURCE_LABEL } from '@/components/shared/badges';
import { HBarChart, type BarDatum } from '@/components/shared/bar-chart';
import { PageHeader } from '@/components/shared/page';
import { Card, CardHeader, FigureStrip } from '@/components/ui/card';
import { Alert, Empty, SkeletonRows, Spinner } from '@/components/ui/feedback';
import { Label, Select } from '@/components/ui/form';
import { useApi } from '@/hooks/useApi';
import { humanize } from '@/lib/utils';
import type { Counts, Dashboard, Finding, Target } from '@/types/api';

/** Chart axis labels must fit one line; the full names are on the Findings page. */
const CHART_CATEGORY: Record<(typeof FINDING_CATEGORIES)[number], string> = {
  AUTHENTICATION: 'Authentication',
  ACCESS_CONTROL: 'Access control',
  SECURITY_CONFIG: 'Config & HTTPS',
};

function bars<T extends string>(counts: Counts, keys: readonly T[], label: (k: T) => string = humanize, color?: (k: T) => string): BarDatum[] {
  return keys.map((k) => ({ label: label(k), value: counts[k] ?? 0, ...(color ? { color: color(k) } : {}) }));
}

function age(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** The latest findings waiting for a decision, newest first. Each opens in the Findings queue. */
function Queue({ targetId }: { targetId: string }) {
  const queue = useApi<Finding[]>('/findings', { target_id: targetId, status: 'PENDING', limit: 6 });
  const href = `/findings?${targetId ? `target_id=${targetId}&` : ''}status=PENDING`;
  return (
    <Card className="lg:col-span-8">
      <CardHeader
        title="Verification queue"
        description="Suggested by tool rules and the AI; nothing counts until an assessor decides."
        actions={
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-black underline-offset-4 hover:underline">
            Open queue
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />
      {queue.loading && !queue.data && <SkeletonRows rows={5} label="Loading the queue" />}
      {queue.error && (
        <div className="px-5 pb-5">
          <Alert kind="error">{queue.error}</Alert>
        </div>
      )}
      {queue.data?.length === 0 && <Empty title="The queue is empty">Every finding has a decision. Run an assessment to look again.</Empty>}
      {queue.data && queue.data.length > 0 && (
        <ol className="border-t border-black">
          {queue.data.map((f) => (
            <li key={f.id} className="border-b border-ink-200 last:border-b-0">
              <Link href={`/findings?${targetId ? `target_id=${targetId}&` : ''}status=PENDING&focus=${f.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2 transition-colors hover:bg-ink-50">
                <span aria-hidden className="h-7 w-1.5" style={{ backgroundColor: f.ai_severity ? SEVERITY_COLOR[f.ai_severity] : 'var(--color-ink-200)' }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-black">{f.title}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ink-500">
                    <span className="truncate">{f.target?.name}</span>
                    <span aria-hidden className="text-ink-300">/</span>
                    <span>{SOURCE_LABEL[f.source]}</span>
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <SeverityBadge severity={f.ai_severity} />
                  <span className="w-8 text-right text-xs tabular-nums text-ink-400">{age(f.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/** Confirmed findings by severity as plain proportional rules: readable at a glance, labelled, no chart chrome. */
function SeverityLedger({ counts }: { counts: Counts }) {
  const total = SEVERITIES.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const max = Math.max(1, ...SEVERITIES.map((s) => counts[s] ?? 0));
  return (
    <Card>
      <CardHeader title="Confirmed by severity" description={total ? `${total} confirmed in total` : 'No confirmed findings yet'} />
      <ul className="px-4 pb-3">
        {SEVERITIES.map((s: Severity) => {
          const n = counts[s] ?? 0;
          return (
            <li key={s} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-3 border-b border-ink-200 py-1.5 last:border-b-0">
              <span className="text-sm font-semibold text-black">{humanize(s)}</span>
              <span className="h-2 bg-ink-100" aria-hidden>
                <span className="block h-2" style={{ width: `${(n / max) * 100}%`, backgroundColor: SEVERITY_COLOR[s] }} />
              </span>
              <span className={`text-right text-sm font-bold tabular-nums ${n ? 'text-black' : 'text-ink-300'}`}>{n}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function QuickActions({ canAssess }: { canAssess: boolean }) {
  const actions = [
    { href: '/targets', label: 'Run an assessment', help: 'Pick a target; every tool runs in one go', icon: ShieldCheck, show: canAssess },
    { href: '/reports', label: 'Open a report', help: 'Confirmed and fixed findings, ready to print', icon: FileText, show: true },
  ].filter((a) => a.show);
  return (
    <Card>
      <CardHeader title="Next steps" />
      <ul className="border-t border-black">
        {actions.map(({ href, label, help, icon: Icon }) => (
          <li key={label} className="border-b border-ink-200 last:border-b-0">
            <Link href={href} className="group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-ink-50">
              <Icon className="h-5 w-5 shrink-0 text-black" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-black">{label}</span>
                <span className="block text-xs text-ink-500">{help}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
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
        title="Overview"
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
        <div className="space-y-5">
          <FigureStrip
            items={[
              { label: 'To verify', value: dash.data.totals.pending_review, tone: dash.data.totals.pending_review ? 'queue' : 'muted', href: `/findings?${q}status=PENDING` },
              { label: 'Confirmed, open', value: dash.data.totals.open_confirmed, tone: dash.data.totals.open_confirmed ? 'signal' : 'muted', href: `/findings?${q}status=CONFIRMED` },
              { label: 'Fixed', value: dash.data.totals.fixed, tone: dash.data.totals.fixed ? 'done' : 'muted', href: `/findings?${q}status=FIXED` },
              { label: 'All findings', value: dash.data.totals.findings, href: `/findings${targetId ? `?target_id=${targetId}` : ''}` },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <Queue targetId={targetId} />
            <div className="space-y-4 lg:col-span-4">
              <SeverityLedger counts={dash.data.findings.confirmed_by_severity} />
              <QuickActions canAssess={can('ADMIN', 'ASSESSOR')} />
            </div>
          </div>

          <section aria-labelledby="breakdown">
            <h2 id="breakdown" className="mb-3 border-b-2 border-black pb-1.5 font-display text-xl font-extrabold text-black">
              Breakdown
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <HBarChart
                title="Waiting, by suggested severity"
                description="Tool rules and the AI. Not verified yet."
                data={bars(dash.data.findings.pending_by_ai_severity, SEVERITIES, humanize, (s) => SEVERITY_COLOR[s])}
                emptyText="Nothing waiting"
              />
              <HBarChart title="Findings by status" data={bars(dash.data.findings.by_status, FINDING_STATUSES)} />
              <HBarChart title="Findings by category" data={bars(dash.data.findings.by_category, FINDING_CATEGORIES, (c) => CHART_CATEGORY[c])} />
              <HBarChart title="Findings by source" data={bars(dash.data.findings.by_source, FINDING_SOURCES, (k) => SOURCE_LABEL[k])} />
              <HBarChart title="Scans by status" data={bars(dash.data.scans.by_status, SCAN_STATUSES)} emptyText="No scans yet" />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
