'use client';

import { ChevronDown, FileText, Globe } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback } from 'react';
import { RunStatusBadge } from '@/components/shared/badges';
import { useAuth } from '@/components/shared/auth-provider';
import { DetailList, PageHeader } from '@/components/shared/page';
import { AssessmentPanel } from '@/components/targets/assessment-panel';
import { ReportImport, ScanLauncher } from '@/components/targets/scan-launcher';
import { ScopeRules } from '@/components/targets/scope-rules';
import { Card, CardBody, CardHeader, FigureStrip } from '@/components/ui/card';
import { Alert, Empty, Spinner } from '@/components/ui/feedback';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { formatDateTime, humanize } from '@/lib/utils';
import type { Scan, Target } from '@/types/api';

function scanSubject(scan: Scan): string {
  const p = scan.params ?? {};
  if (p.filename) return p.filename;
  if (p.found_url) return p.found_url;
  if (p.url) return p.discover ? `${p.url} and other spec paths` : p.url;
  if (p.host) return p.ports ? `${p.host} : ${p.ports}` : p.host;
  return '-';
}

const linkButton = 'inline-flex h-9 items-center gap-2 border border-black bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-ink-100';

export default function TargetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canEdit = can('ADMIN', 'ASSESSOR');
  const target = useApi<Target>(`/targets/${id}`);
  const scans = useApi<Scan[]>(`/targets/${id}/scans`);
  const assessment = useApi<{ findings: Record<string, number> }>(`/targets/${id}/assessment`);
  const reloadScans = scans.reload;
  const reloadAssessment = assessment.reload;
  const refresh = useCallback(() => {
    void reloadScans();
    void reloadAssessment();
  }, [reloadScans, reloadAssessment]);

  const counts = assessment.data?.findings ?? {};
  if (target.loading && !target.data) return <Spinner />;
  if (target.error || !target.data) return <Alert kind="error">{target.error ?? 'Target not found'}</Alert>;
  const t = target.data;

  return (
    <>
      <PageHeader
        crumbs={[{ href: '/targets', label: 'Targets' }]}
        title={t.name}
        description={
          <span className="inline-flex items-center gap-1.5 font-semibold text-black">
            <Globe className="h-4 w-4" aria-hidden />
            {t.base_url}
          </span>
        }
        actions={
          <Link href={`/reports/${t.id}`} className={linkButton}>
            <FileText className="h-4 w-4" aria-hidden />
            Report
          </Link>
        }
      />

      <div className="space-y-8">
        <AssessmentPanel targetId={t.id} baseUrl={t.base_url} scopeRules={t.scope_rules?.length ?? 0} canRun={canEdit} onChange={refresh} />

        <FigureStrip
          items={[
            { label: 'To verify', value: counts.PENDING ?? 0, tone: counts.PENDING ? 'queue' : 'muted', href: `/findings?target_id=${t.id}&status=PENDING` },
            { label: 'Confirmed', value: counts.CONFIRMED ?? 0, tone: counts.CONFIRMED ? 'signal' : 'muted', href: `/findings?target_id=${t.id}&status=CONFIRMED` },
            { label: 'Fixed', value: counts.FIXED ?? 0, tone: counts.FIXED ? 'done' : 'muted', href: `/findings?target_id=${t.id}&status=FIXED` },
            { label: 'Dismissed', value: (counts.REJECTED ?? 0) + (counts.FALSE_POSITIVE ?? 0), tone: 'muted', note: 'Rejected or false positive' },
            { label: 'Scans', value: scans.data?.length ?? 0 },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <ScopeRules targetId={t.id} rules={t.scope_rules ?? []} canEdit={canEdit} onChange={() => void target.reload()} />
          </div>
          <Card className="lg:col-span-4">
            <CardHeader title="Authorization" description="What the team is allowed to test, and when." />
            <CardBody>
              <DetailList
                single
                items={[
                  ['Authorization note', t.authorization_note || <span className="font-semibold text-amber-700">Not recorded yet</span>],
                  ['Test window', t.test_window_start || t.test_window_end ? `${formatDateTime(t.test_window_start)} to ${formatDateTime(t.test_window_end)}` : 'Any time'],
                  ['Description', t.description || '-'],
                  ['Registered by', t.creator ? `${t.creator.name}, ${formatDateTime(t.created_at)}` : formatDateTime(t.created_at)],
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Scan history" description="Every tool run and imported report for this target, newest first." />
          {scans.loading && !scans.data && <Spinner />}
          {scans.error && (
            <CardBody>
              <Alert kind="error">{scans.error}</Alert>
            </CardBody>
          )}
          {scans.data?.length === 0 && <Empty title="No scans yet">Run the full assessment above to start.</Empty>}
          {scans.data && scans.data.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Tool</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Results</Th>
                  <Th className="text-right">Findings</Th>
                  <Th>Started</Th>
                </tr>
              </thead>
              <tbody>
                {scans.data.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-ink-50/70">
                    <Td>
                      <Link href={`/scans/${s.id}`} className="font-bold text-black underline-offset-4 hover:underline">
                        {humanize(s.tool)}
                      </Link>
                      {s.source === 'IMPORT' && <span className="ml-1.5 text-xs text-ink-500">imported</span>}
                    </Td>
                    <Td className="max-w-xs truncate text-xs text-ink-500" title={scanSubject(s)}>
                      {scanSubject(s)}
                    </Td>
                    <Td>
                      <RunStatusBadge status={s.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{s._count?.results ?? 0}</Td>
                    <Td className="text-right tabular-nums">{s._count?.findings ?? 0}</Td>
                    <Td className="whitespace-nowrap text-ink-500">
                      {formatDateTime(s.created_at)}
                      {s.starter?.name && <span className="block text-xs">{s.starter.name}</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {canEdit && (
          <details className="group border border-t-2 border-ink-200 border-t-black bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-base font-bold text-black">Advanced</span>
                <span className="mt-0.5 block text-[13px] text-ink-500">Run a single tool with custom settings, or import an Nmap or ZAP report.</span>
              </span>
              <ChevronDown className="h-5 w-5 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="grid grid-cols-1 gap-6 border-t border-ink-100 p-5 lg:grid-cols-2">
              <ScanLauncher targetId={t.id} baseUrl={t.base_url} onFinished={refresh} />
              <ReportImport targetId={t.id} onImported={refresh} />
            </div>
          </details>
        )}
      </div>
    </>
  );
}
