'use client';

import { FINDING_CATEGORIES, FINDING_SOURCES, type FindingStatus, type Severity } from '@tanaw/shared';
import { Paperclip, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AiUnverifiedBadge, CATEGORY_LABEL, FindingStatusBadge, SEVERITY_COLOR, SeverityBadge, SOURCE_LABEL, SourceBadge } from '@/components/shared/badges';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader, Pagination } from '@/components/shared/page';
import { ManualFindingForm } from '@/components/findings/manual-finding-form';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty, SkeletonRows, Spinner } from '@/components/ui/feedback';
import { Label, SearchInput, Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { useApi } from '@/hooks/useApi';
import { formatDate } from '@/lib/utils';
import type { Finding, Target } from '@/types/api';

const FILTERS = ['target_id', 'status', 'category', 'source', 'q'] as const;

/** The status is the main way to slice findings, so it gets tabs; the rest are secondary filters. */
const STATUS_TABS: Array<{ value: FindingStatus | ''; label: string }> = [
  { value: 'PENDING', label: 'To verify' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'FIXED', label: 'Fixed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'FALSE_POSITIVE', label: 'False positive' },
  { value: '', label: 'All' },
];

function FindingRow({ f }: { f: Finding }) {
  const severity: Severity | null = f.final_severity ?? f.ai_severity;
  return (
    <li>
      <Link href={`/findings/${f.id}`} className="group flex gap-4 px-5 py-4 transition-colors hover:bg-ink-50/70">
        <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ backgroundColor: severity ? SEVERITY_COLOR[severity] : 'var(--color-ink-200)' }} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900 group-hover:text-brand-700">{f.title}</p>
          <p className="mt-1 truncate text-[13px] text-ink-500">
            <span className="font-medium text-ink-600">{f.target?.name}</span>
            <span className="mx-2 text-ink-300">/</span>
            {f.affected_asset}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {f.source === 'AI' && f.status === 'PENDING' ? <AiUnverifiedBadge /> : <SourceBadge source={f.source} />}
            <span className="text-xs text-ink-500">{CATEGORY_LABEL[f.category]}</span>
            {f.wstg_id && <span className="text-xs text-ink-400">{f.wstg_id}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          {f.final_severity ? <SeverityBadge severity={f.final_severity} /> : <SeverityBadge severity={f.ai_severity} prefix="Suggested " />}
          <FindingStatusBadge status={f.status} />
          <span className="flex items-center gap-2 text-xs text-ink-400">
            <span className="flex items-center gap-0.5" title="Evidence items">
              <Paperclip className="h-3 w-3" aria-hidden />
              {f._count?.evidence ?? 0}
            </span>
            {formatDate(f.created_at)}
          </span>
        </div>
      </Link>
    </li>
  );
}

function FindingsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const filters = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? ''])) as Record<(typeof FILTERS)[number], string>;
  const page = Number(params.get('page') ?? 1) || 1;
  const targets = useApi<Target[]>('/targets');
  const findings = useApi<Finding[]>('/findings', { ...filters, page, limit: 20 });
  const [search, setSearch] = useState(filters.q);
  const setParamRef = useRef(setParam);
  setParamRef.current = setParam;
  // Debounce typing into the URL (?q=), which drives the request.
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const timer = setTimeout(() => setParamRef.current('q', search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search, filters.q]);

  function setParam(key: string, value: string | number) {
    const next = new URLSearchParams(params.toString());
    if (value === '' || value === 1) next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  }

  const filterSelect = (key: (typeof FILTERS)[number], label: string, options: Array<[string, string]>) => (
    <div className="min-w-0">
      <Label htmlFor={`f-${key}`} className="sr-only">
        {label}
      </Label>
      <Select id={`f-${key}`} value={filters[key]} onChange={(e) => setParam(key, e.target.value)} className="h-9">
        <option value="">{`Any ${label.toLowerCase()}`}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every scan adds findings here on its own, from tool rules and the AI. They only count once an assessor confirms them."
        actions={
          can('ADMIN', 'ASSESSOR') && (
            <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
              <Plus className="h-4 w-4" aria-hidden />
              {showForm ? 'Close' : 'Add manual finding'}
            </Button>
          )
        }
      />
      {showForm && targets.data && (
        <Card className="mb-6">
          <CardHeader title="Record a manual finding" description="For hand tests, such as an IDOR found with two test accounts. It starts as To verify." />
          <CardBody>
            <ManualFindingForm targets={targets.data} defaultTargetId={filters.target_id} onCreated={(id) => router.push(`/findings/${id}`)} />
          </CardBody>
        </Card>
      )}

      <Tabs label="Finding status" value={filters.status} onChange={(v) => setParam('status', v)} tabs={STATUS_TABS.map((t) => ({ value: t.value, label: t.label, attention: t.value === 'PENDING' }))} />

      <Card>
        <div className="grid grid-cols-1 gap-2 border-b border-ink-100 px-5 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput
            label="Search findings"
            placeholder="Search title, asset or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filterSelect('target_id', 'Target', (targets.data ?? []).map((t) => [t.id, t.name]))}
          {filterSelect('category', 'Category', FINDING_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]]))}
          {filterSelect('source', 'Source', FINDING_SOURCES.map((s) => [s, SOURCE_LABEL[s]]))}
        </div>
        {findings.loading && !findings.data && <SkeletonRows rows={5} label="Loading findings" />}
        {findings.error && (
          <CardBody className="pt-5">
            <Alert kind="error">{findings.error}</Alert>
          </CardBody>
        )}
        {findings.data?.length === 0 && (
          <Empty title={filters.q ? `No findings match "${filters.q}"` : filters.status === 'PENDING' ? 'Nothing waiting for verification' : 'No findings match these filters'}>
            {filters.q ? 'Try fewer words, or clear the other filters.' : 'Run a full assessment from a target page and its scans turn into findings here.'}
          </Empty>
        )}
        {findings.data && findings.data.length > 0 && (
          <ul className="divide-y divide-ink-100">
            {findings.data.map((f) => (
              <FindingRow key={f.id} f={f} />
            ))}
          </ul>
        )}
        <Pagination meta={findings.meta} onPage={(p) => setParam('page', p)} />
      </Card>
    </>
  );
}

export default function FindingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FindingsView />
    </Suspense>
  );
}
