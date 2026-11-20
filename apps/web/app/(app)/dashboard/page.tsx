'use client';

import { FINDING_CATEGORIES, FINDING_SOURCES, FINDING_STATUSES, SCAN_STATUSES, SEVERITIES, type Severity } from '@tanaw/shared';
import Link from 'next/link';
import { useState } from 'react';
import { HBarChart, type BarDatum } from '@/components/shared/bar-chart';
import { CATEGORY_LABEL } from '@/components/shared/badges';
import { PageHeader } from '@/components/shared/page';
import { Card } from '@/components/ui/card';
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

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: string }) {
  const body = (
    <Card className="h-full px-5 py-4 transition-colors hover:border-brand-500/40">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tone ?? 'text-slate-900'}`}>{value}</p>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
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
        description="Only confirmed findings count toward real severity. Pending ones are suggestions."
        actions={
          <div className="w-64">
            <Label htmlFor="dash-target">Target</Label>
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Confirmed, open" value={dash.data.totals.open_confirmed} href={`/findings?${q}status=CONFIRMED`} tone="text-red-700" />
            <Stat label="Pending review" value={dash.data.totals.pending_review} href={`/findings?${q}status=PENDING`} tone="text-amber-700" />
            <Stat label="Fixed" value={dash.data.totals.fixed} href={`/findings?${q}status=FIXED`} tone="text-emerald-700" />
            <Stat label="All findings" value={dash.data.totals.findings} href={`/findings${targetId ? `?target_id=${targetId}` : ''}`} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <HBarChart
              title="Confirmed findings by severity"
              description="Final severity set by an assessor."
              data={bars(dash.data.findings.confirmed_by_severity, SEVERITIES, humanize, (s) => SEVERITY_RAMP[s])}
              emptyText="No confirmed findings yet"
            />
            <HBarChart
              title="Pending findings by AI-suggested severity"
              description="Not verified. Review these on the Findings page."
              data={bars(dash.data.findings.pending_by_ai_severity, SEVERITIES, humanize, (s) => SEVERITY_RAMP[s])}
              emptyText="Nothing waiting for review"
            />
            <HBarChart title="Findings by status" data={bars(dash.data.findings.by_status, FINDING_STATUSES)} />
            <HBarChart title="Findings by category" data={bars(dash.data.findings.by_category, FINDING_CATEGORIES, (c) => CATEGORY_LABEL[c])} />
            <HBarChart title="Findings by source" data={bars(dash.data.findings.by_source, FINDING_SOURCES)} />
            <HBarChart title="Scans by status" data={bars(dash.data.scans.by_status, SCAN_STATUSES)} emptyText="No scans yet" />
          </div>
        </div>
      )}
    </>
  );
}
