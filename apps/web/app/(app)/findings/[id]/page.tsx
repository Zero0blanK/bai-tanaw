'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AiUnverifiedBadge, CATEGORY_LABEL, FindingStatusBadge, SeverityBadge, SourceBadge } from '@/components/shared/badges';
import { useAuth } from '@/components/shared/auth-provider';
import { JobBanner } from '@/components/shared/job-banner';
import { DetailList, PageHeader } from '@/components/shared/page';
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
            <SourceBadge source={f.source} />
            {f.source === 'AI' && f.status === 'PENDING' && <AiUnverifiedBadge />}
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
      <div className="space-y-6">
        {retestError && <Alert kind="warning">{retestError}</Alert>}
        {retest && (
          <div className="space-y-2">
            <JobBanner jobId={retest.jobId} label="Retest scan" />
            <p className="text-sm">
              <Link href={`/scans/${retest.scanId}`} className="text-brand-700 underline">
                Open the retest scan
              </Link>{' '}
              and compare it with the original before marking the finding fixed.
            </p>
          </div>
        )}

        <Card>
          <CardBody className="space-y-4">
            <DetailList
              items={[
                ['Category', CATEGORY_LABEL[f.category]],
                ['Affected asset', <span key="a" className="font-mono text-xs">{f.affected_asset}</span>],
                ['Final severity', <SeverityBadge key="fs" severity={f.final_severity} />],
                ['AI suggested severity', <SeverityBadge key="as" severity={f.ai_severity} />],
                ['CVSS v3.1', f.cvss_score !== null ? <span key="c">{f.cvss_score} <span className="font-mono text-xs text-slate-500">{f.cvss_vector}</span></span> : '-'],
                ['OWASP Top 10 / WSTG', [f.owasp_top10, f.wstg_id].filter(Boolean).join(' · ') || '-'],
                ['From scan', f.scan ? <Link key="s" href={`/scans/${f.scan.id}`} className="text-brand-700 hover:underline">{humanize(f.scan.tool)} ({formatDateTime(f.scan.created_at)})</Link> : 'Manual'],
                ['Created', formatDateTime(f.created_at)],
              ]}
            />
            <div>
              <p className="text-xs font-medium text-slate-500">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{f.description}</p>
            </div>
          </CardBody>
        </Card>

        {canEdit && <VerifyForm key={f.status} finding={f} onSaved={reload} />}

        <EvidencePanel findingId={f.id} evidence={f.evidence} canEdit={canEdit} onAdded={reload} />

        <RemediationPanel key={f.remediation ?? ''} finding={f} canEdit={canEdit} onSaved={reload} />

        <Card>
          <CardHeader title="Verification history" />
          {f.verification_logs.length === 0 ? (
            <Empty title="No decisions yet" />
          ) : (
            <ol className="divide-y divide-slate-100 px-5">
              {f.verification_logs.map((l) => (
                <li key={l.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <FindingStatusBadge status={l.old_status} /> → <FindingStatusBadge status={l.new_status} />
                    <span className="text-xs text-slate-500">
                      {l.assessor?.name ?? 'deleted user'} · {formatDateTime(l.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">{l.notes}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
