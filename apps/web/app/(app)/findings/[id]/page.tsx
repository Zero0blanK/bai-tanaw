'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AiUnverifiedBadge, CATEGORY_LABEL, FindingStatusBadge, SeverityBadge, SourceBadge } from '@/components/shared/badges';
import { useAuth } from '@/components/shared/auth-provider';
import { JobBanner } from '@/components/shared/job-banner';
import { PageHeader } from '@/components/shared/page';
import { EvidencePanel } from '@/components/findings/evidence-panel';
import { RemediationPanel } from '@/components/findings/remediation-panel';
import { VerifyForm } from '@/components/findings/verify-form';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty, Spinner } from '@/components/ui/feedback';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/utils';
import type { FindingDetail, Job, Scan } from '@/types/api';

export default function FindingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const canEdit = can('ADMIN', 'ASSESSOR');
  const finding = useApi<FindingDetail>(`/findings/${id}`);
  const [retest, setRetest] = useState<{ scanId: string; jobId: string } | null>(null);
  const [retestError, setRetestError] = useState<string | null>(null);

  if (finding.loading && !finding.data) return <Spinner />;
  if (finding.error || !finding.data) return <Alert kind="error">{finding.error ?? 'Finding not found'}</Alert>;
  const f = finding.data;
  const reload = () => void finding.reload();

  async function startRetest() {
    setRetestError(null);
    try {
      const { data } = await api<{ scan: Scan; job: Job }>(`/findings/${f.id}/retest`, { method: 'POST' });
      setRetest({ scanId: data.scan.id, jobId: data.job.id });
    } catch (e) {
      setRetestError(errorMessage(e));
    }
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { href: '/findings', label: 'Findings' },
          ...(f.target ? [{ href: `/targets/${f.target.id}`, label: f.target.name }] : []),
        ]}
        title={f.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <FindingStatusBadge status={f.status} />
            {f.source === 'AI' && f.status === 'PENDING' ? <AiUnverifiedBadge /> : <SourceBadge source={f.source} />}
            {f.target && (
              <Link href={`/targets/${f.target.id}`} className="text-sm font-semibold text-black underline underline-offset-4">
                {f.target.name}
              </Link>
            )}
          </span>
        }
        actions={
          canEdit &&
          f.status === 'CONFIRMED' && (
            <Button variant="secondary" onClick={() => void startRetest()}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Retest
            </Button>
          )
        }
      />
      {retestError && <Alert kind="warning" className="mb-6">{retestError}</Alert>}
      {retest && (
        <div className="mb-6 space-y-2">
          <JobBanner jobId={retest.jobId} label="Retest scan" />
          <p className="text-sm">
            <Link href={`/scans/${retest.scanId}`} className="font-bold text-black underline underline-offset-4">
              Open the retest scan
            </Link>{' '}
            and compare it with the original before marking the finding fixed.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="min-w-0 space-y-8 lg:col-span-8">
          <section aria-labelledby="found">
            <h2 id="found" className="border-b-2 border-black pb-2 text-base font-bold text-black">
              What was found
            </h2>
            <p className="mt-4 max-w-prose text-[15px] leading-relaxed whitespace-pre-wrap text-ink-800">{f.description}</p>
            <p className="mt-4 text-sm break-all text-ink-600">
              <span className="font-bold text-black">Affected asset</span> {f.affected_asset}
            </p>
          </section>

          <EvidencePanel findingId={f.id} evidence={f.evidence} canEdit={canEdit} onAdded={reload} />

          <RemediationPanel key={f.remediation ?? ''} finding={f} canEdit={canEdit} onSaved={reload} />

          <Card>
            <CardHeader title="Decision history" description="Every status change, who made it and why. Kept in the report." />
            {f.verification_logs.length === 0 ? (
              <Empty title="No decisions yet" />
            ) : (
              <ol className="border-t border-black px-5">
                {f.verification_logs.map((l) => (
                  <li key={l.id} className="border-b border-ink-200 py-3 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FindingStatusBadge status={l.old_status} />
                      <span aria-hidden>→</span>
                      <span className="sr-only">to</span>
                      <FindingStatusBadge status={l.new_status} />
                      <span className="text-xs text-ink-500">
                        {l.assessor?.name ?? 'deleted user'}, {formatDateTime(l.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-ink-700">{l.notes}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <div className="lg:sticky lg:top-[calc(var(--spacing-topbar)+1.5rem)] lg:space-y-6">
            <Card>
              <CardHeader title="Facts" />
              <CardBody>
                <dl className="divide-y divide-ink-200 border-t border-black text-sm">
                  {(
                    [
                      ['Final severity', <SeverityBadge key="fs" severity={f.final_severity} />],
                      ['Suggested', <SeverityBadge key="as" severity={f.ai_severity} />],
                      ['CVSS v3.1', f.cvss_score !== null ? <span key="c"><span className="font-bold tabular-nums text-black">{f.cvss_score}</span> <span className="block font-mono text-[11px] break-all text-ink-500">{f.cvss_vector}</span></span> : '-'],
                      ['Category', CATEGORY_LABEL[f.category]],
                      ['OWASP / WSTG', [f.owasp_top10, f.wstg_id].filter(Boolean).join(' / ') || '-'],
                      ['From scan', f.scan ? <Link key="s" href={`/scans/${f.scan.id}`} className="font-semibold text-black underline underline-offset-4">{humanize(f.scan.tool)}</Link> : 'Manual'],
                      ['Raised', formatDateTime(f.created_at)],
                    ] as Array<[string, ReactNode]>
                  ).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[7rem_1fr] gap-3 py-2">
                      <dt className="font-bold text-black">{k}</dt>
                      <dd className="min-w-0 text-ink-700">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
            {canEdit && (
              <div id="verify" className="scroll-mt-24">
                <VerifyForm key={f.status} finding={f} onSaved={reload} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
