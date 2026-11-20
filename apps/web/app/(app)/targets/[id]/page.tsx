'use client';

import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RunStatusBadge } from '@/components/shared/badges';
import { useAuth } from '@/components/shared/auth-provider';
import { DetailList, PageHeader } from '@/components/shared/page';
import { ScanLauncher, ReportImport } from '@/components/targets/scan-launcher';
import { ScopeRules } from '@/components/targets/scope-rules';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty, Spinner } from '@/components/ui/feedback';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { formatDateTime, humanize } from '@/lib/utils';
import type { Scan, Target } from '@/types/api';

function scanSubject(scan: Scan): string {
  const p = scan.params ?? {};
  if (p.filename) return p.filename;
  if (p.url) return p.url;
  if (p.host) return p.ports ? `${p.host} : ${p.ports}` : p.host;
  return '-';
}

export default function TargetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canEdit = can('ADMIN', 'ASSESSOR');
  const target = useApi<Target>(`/targets/${id}`);
  const scans = useApi<Scan[]>(`/targets/${id}/scans`);

  if (target.loading && !target.data) return <Spinner />;
  if (target.error || !target.data) return <Alert kind="error">{target.error ?? 'Target not found'}</Alert>;
  const t = target.data;

  return (
    <>
      <PageHeader
        crumbs={[{ href: '/targets', label: 'Targets' }]}
        title={t.name}
        description={<span className="font-mono text-xs">{t.base_url}</span>}
        actions={
          <Link href={`/reports/${t.id}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
            <FileText className="h-4 w-4" aria-hidden />
            Report
          </Link>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Authorization" />
          <CardBody>
            <DetailList
              items={[
                ['Authorization note', t.authorization_note || <span className="text-amber-700">Not recorded</span>],
                ['Test window', t.test_window_start || t.test_window_end ? `${formatDateTime(t.test_window_start)} to ${formatDateTime(t.test_window_end)}` : 'No window set'],
                ['Description', t.description || '-'],
                ['Registered by', t.creator ? `${t.creator.name} (${formatDateTime(t.created_at)})` : formatDateTime(t.created_at)],
              ]}
            />
          </CardBody>
        </Card>

        <ScopeRules targetId={t.id} rules={t.scope_rules ?? []} canEdit={canEdit} onChange={() => void target.reload()} />

        {canEdit && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ScanLauncher targetId={t.id} baseUrl={t.base_url} onFinished={() => void scans.reload()} />
            <ReportImport targetId={t.id} onImported={() => void scans.reload()} />
          </div>
        )}

        <Card>
          <CardHeader title="Scans" description="Tool runs and imported reports for this target." />
          {scans.loading && !scans.data && <Spinner />}
          {scans.error && (
            <CardBody>
              <Alert kind="error">{scans.error}</Alert>
            </CardBody>
          )}
          {scans.data?.length === 0 && <Empty title="No scans yet" />}
          {scans.data && scans.data.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Tool</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th>Results</Th>
                  <Th>Findings</Th>
                  <Th>Started by</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {scans.data.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/scans/${s.id}`} className="font-medium text-brand-700 hover:underline">
                        {humanize(s.tool)}
                      </Link>
                      {s.source === 'IMPORT' && <span className="ml-1 text-xs text-slate-500">(import)</span>}
                    </Td>
                    <Td className="max-w-xs truncate font-mono text-xs" title={scanSubject(s)}>
                      {scanSubject(s)}
                    </Td>
                    <Td>
                      <RunStatusBadge status={s.status} />
                    </Td>
                    <Td>{s._count?.results ?? 0}</Td>
                    <Td>{s._count?.findings ?? 0}</Td>
                    <Td>{s.starter?.name ?? '-'}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(s.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
