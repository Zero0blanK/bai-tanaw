'use client';

import type { ScanResultType } from '@tanaw/shared';
import { Download, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { RunStatusBadge } from '@/components/shared/badges';
import { useAuth } from '@/components/shared/auth-provider';
import { JobBanner } from '@/components/shared/job-banner';
import { DetailList, PageHeader, Pagination } from '@/components/shared/page';
import { ResultSummary } from '@/components/scans/result-row';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty, Spinner } from '@/components/ui/feedback';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { cn, formatDateTime, humanize } from '@/lib/utils';
import type { AiAnalysis, Job, ScanDetail } from '@/types/api';

function InterpretPanel({ scan, onDone }: { scan: ScanDetail; onDone: () => void }) {
  const { can } = useAuth();
  const usage = useApi<{ used: number; limit: number; remaining: number; configured: boolean }>('/ai/usage');
  const analyses = useApi<AiAnalysis[]>(`/scans/${scan.id}/ai`);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<Job['result']>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Object.values(scan.result_counts).reduce((a, b) => a + (b ?? 0), 0);
  const canRun = can('ADMIN', 'ASSESSOR') && scan.status === 'DONE' && total > 0;

  async function interpret() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api<{ job: Job }>(`/scans/${scan.id}/interpret`, { method: 'POST' });
      setJobId(data.job.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      void usage.reload();
    }
  }

  return (
    <Card>
      <CardHeader
        title="AI interpretation"
        description="The AI reads every finished scan on its own (secrets removed first) and adds findings the tool rules missed. Each one stays To verify until an assessor decides."
        actions={
          canRun && (
            <Button onClick={() => void interpret()} loading={busy} disabled={Boolean(jobId) && !result} variant="secondary" size="sm">
              <Sparkles className="h-4 w-4" aria-hidden />
              Re-run AI
            </Button>
          )
        }
      />
      <CardBody className="space-y-3">
        {usage.data && (
          <p className="text-xs text-ink-500">
            AI calls today: {usage.data.used} of {usage.data.limit} used.
          </p>
        )}
        {usage.data && !usage.data.configured && (
          <Alert kind="warning">
            AI isn&apos;t set up yet.{' '}
            {can('ADMIN') ? (
              <Link href="/settings" className="underline">
                Add the API key in Settings.
              </Link>
            ) : (
              'An admin can add the API key in Settings.'
            )}
          </Alert>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <JobBanner
          key={jobId}
          jobId={jobId}
          label="AI interpretation"
          onDone={(job) => {
            setResult(job.result);
            void analyses.reload();
            onDone();
          }}
        />
        {result && (
          <Alert kind="info">
            The AI suggested {String(result.findings_created ?? 0)} finding(s).{' '}
            <Link href={`/findings?target_id=${scan.target_id}&source=AI&status=PENDING`} className="font-medium underline">
              Review them
            </Link>
            .
          </Alert>
        )}
        {analyses.data?.length === 0 && !jobId && usage.data?.configured && (
          <p className="text-sm text-ink-500">No AI reading yet. It starts automatically once the scan finishes.</p>
        )}
        {analyses.data && analyses.data.length > 0 && (
          <ul className="divide-y divide-ink-100 text-sm">
            {analyses.data.map((a) => {
              const count = Array.isArray(a.output.findings) ? a.output.findings.length : 0;
              return (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {count} suggestion(s) from <span className="font-mono text-xs">{a.model}</span>
                  </span>
                  <span className="text-xs text-ink-500">
                    {formatDateTime(a.created_at)}, for {a.creator?.name ?? 'unknown'}
                    {a.tokens_in !== null && `, ${a.tokens_in + (a.tokens_out ?? 0)} tokens`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [type, setType] = useState<ScanResultType | undefined>();
  const [page, setPage] = useState(1);
  const scan = useApi<ScanDetail>(`/scans/${id}`, { type, page, limit: 50 });
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (scan.loading && !scan.data) return <Spinner />;
  if (scan.error || !scan.data) return <Alert kind="error">{scan.error ?? 'Scan not found'}</Alert>;
  const s = scan.data;
  const counts = Object.entries(s.result_counts) as Array<[ScanResultType, number]>;
  const total = counts.reduce((a, [, n]) => a + n, 0);

  async function download() {
    setDownloadError(null);
    try {
      const ext = s.raw_output_path?.split('.').pop() ?? 'txt';
      await downloadFile(`/scans/${s.id}/raw`, `${s.tool.toLowerCase()}-${s.id}.${ext}`);
    } catch (e) {
      setDownloadError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/targets', label: 'Targets' },
          ...(s.target ? [{ href: `/targets/${s.target.id}`, label: s.target.name }] : []),
        ]}
        title={
          <span className="flex items-center gap-3">
            {humanize(s.tool)} scan <RunStatusBadge status={s.status} />
          </span>
        }
        actions={
          s.raw_output_path &&
          can('ADMIN', 'ASSESSOR') && (
            <Button variant="secondary" onClick={() => void download()}>
              <Download className="h-4 w-4" aria-hidden />
              Raw output
            </Button>
          )
        }
      />
      <div className="space-y-6">
        {downloadError && <Alert kind="error">{downloadError}</Alert>}
        {s.error && <Alert kind="error">{s.error}</Alert>}
        <Card>
          <CardBody>
            <DetailList
              items={[
                ['Source', humanize(s.source)],
                ['Subject', <span key="p" className="font-mono text-xs">{s.params?.url ?? s.params?.filename ?? [s.params?.host, s.params?.ports].filter(Boolean).join(' : ') ?? '-'}</span>],
                ['Started by', s.starter?.name ?? '-'],
                ['Created', formatDateTime(s.created_at)],
                ['Finished', formatDateTime(s.finished_at)],
                ['Findings linked', String(s._count?.findings ?? 0)],
              ]}
            />
          </CardBody>
        </Card>

        <InterpretPanel scan={s} onDone={() => void scan.reload()} />

        <Card>
          <CardHeader title={`Results (${total})`} />
          {counts.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-ink-100 px-5 py-3" role="tablist" aria-label="Result type">
              {[[undefined, total] as const, ...counts].map(([t, n]) => (
                <button
                  key={t ?? 'all'}
                  role="tab"
                  aria-selected={type === t}
                  onClick={() => {
                    setType(t);
                    setPage(1);
                  }}
                  className={cn('border px-3 py-1 text-xs font-bold', type === t ? 'border-black bg-black text-white' : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-200')}
                >
                  {t ? humanize(t) : 'All'} ({n})
                </button>
              ))}
            </div>
          )}
          {s.results.length === 0 ? (
            <Empty title={s.status === 'DONE' ? 'No results' : 'No results yet'}>{s.status === 'QUEUED' || s.status === 'RUNNING' ? 'The worker is still running this scan.' : null}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-12">#</Th>
                  <Th className="w-28">Type</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {s.results.map((r, i) => (
                  <tr key={r.id}>
                    <Td className="text-xs text-ink-400">{(page - 1) * 50 + i + 1}</Td>
                    <Td className="text-xs">{humanize(r.type)}</Td>
                    <Td>
                      <ResultSummary type={r.type} data={r.data} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <Pagination meta={scan.meta} onPage={setPage} />
        </Card>
      </div>
    </>
  );
}
