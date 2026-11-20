'use client';

import { FINDING_CATEGORIES, FINDING_SOURCES, FINDING_STATUSES } from '@tanaw/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AiUnverifiedBadge, CATEGORY_LABEL, FindingStatusBadge, SeverityBadge, SourceBadge } from '@/components/shared/badges';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader, Pagination } from '@/components/shared/page';
import { ManualFindingForm } from '@/components/findings/manual-finding-form';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty, Spinner } from '@/components/ui/feedback';
import { Label, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { formatDate, humanize } from '@/lib/utils';
import type { Finding, Target } from '@/types/api';

const FILTERS = ['target_id', 'status', 'category', 'source'] as const;

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

  function setParam(key: string, value: string | number) {
    const next = new URLSearchParams(params.toString());
    if (value === '' || value === 1) next.delete(key);
    else next.set(key, String(value));
    if (key !== 'page') next.delete('page');
    router.replace(`${pathname}?${next.toString()}`);
  }

  const filterSelect = (key: (typeof FILTERS)[number], label: string, options: Array<[string, string]>) => (
    <div>
      <Label htmlFor={`f-${key}`}>{label}</Label>
      <Select id={`f-${key}`} value={filters[key]} onChange={(e) => setParam(key, e.target.value)}>
        <option value="">All</option>
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
        description="Tools and AI only suggest. A finding counts once an assessor confirms it."
        actions={
          can('ADMIN', 'ASSESSOR') && (
            <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
              <Plus className="h-4 w-4" aria-hidden />
              {showForm ? 'Close' : 'Manual finding'}
            </Button>
          )
        }
      />
      {showForm && targets.data && (
        <Card className="mb-6">
          <CardHeader title="Record a manual finding" description="For hand tests (for example an IDOR found with two test accounts). It starts PENDING." />
          <CardBody>
            <ManualFindingForm
              targets={targets.data}
              defaultTargetId={filters.target_id}
              onCreated={(id) => router.push(`/findings/${id}`)}
            />
          </CardBody>
        </Card>
      )}
      <Card>
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-4">
          {filterSelect('target_id', 'Target', (targets.data ?? []).map((t) => [t.id, t.name]))}
          {filterSelect('status', 'Status', FINDING_STATUSES.map((s) => [s, humanize(s)]))}
          {filterSelect('category', 'Category', FINDING_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]]))}
          {filterSelect('source', 'Source', FINDING_SOURCES.map((s) => [s, humanize(s)]))}
        </div>
        {findings.loading && !findings.data && <Spinner />}
        {findings.error && (
          <CardBody>
            <Alert kind="error">{findings.error}</Alert>
          </CardBody>
        )}
        {findings.data?.length === 0 && <Empty title="No findings match these filters" />}
        {findings.data && findings.data.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Finding</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th>Severity</Th>
                <Th>Source</Th>
                <Th>Evidence</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {findings.data.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <Td className="max-w-md">
                    <Link href={`/findings/${f.id}`} className="font-medium text-brand-700 hover:underline">
                      {f.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {f.target?.name}
                      {f.source === 'AI' && f.status === 'PENDING' && <AiUnverifiedBadge />}
                    </div>
                  </Td>
                  <Td className="text-xs">{CATEGORY_LABEL[f.category]}</Td>
                  <Td>
                    <FindingStatusBadge status={f.status} />
                  </Td>
                  <Td>{f.final_severity ? <SeverityBadge severity={f.final_severity} /> : <SeverityBadge severity={f.ai_severity} prefix="AI: " />}</Td>
                  <Td>
                    <SourceBadge source={f.source} />
                  </Td>
                  <Td>{f._count?.evidence ?? 0}</Td>
                  <Td className="whitespace-nowrap text-xs">{formatDate(f.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
