'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { JobBanner } from '@/components/shared/job-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Textarea } from '@/components/ui/form';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { AiAnalysis, FindingDetail, Job, RemediationDraft } from '@/types/api';

function Draft({ analysis, onAccept, accepting }: { analysis: AiAnalysis; onAccept?: () => void; accepting: boolean }) {
  const d = analysis.output as unknown as RemediationDraft;
  return (
    <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50/40 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="purple">
            <Sparkles className="h-3 w-3" aria-hidden />
            AI draft
          </Badge>
          <Badge tone={d.confidence === 'HIGH' ? 'green' : d.confidence === 'MEDIUM' ? 'amber' : 'red'}>{d.confidence.toLowerCase()} confidence</Badge>
          <span className="text-xs text-slate-500">
            {analysis.model} · {formatDateTime(analysis.created_at)}
          </span>
        </div>
        {onAccept && (
          <Button size="sm" variant="secondary" onClick={onAccept} loading={accepting}>
            Accept as remediation
          </Button>
        )}
      </div>
      <p className="text-slate-800">{d.summary}</p>
      <ol className="list-inside list-decimal space-y-1 text-slate-700">
        {d.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {d.code_example && <pre className="overflow-auto rounded bg-slate-900 px-3 py-2 text-xs text-slate-100">{d.code_example}</pre>}
      {d.references.length > 0 && (
        <ul className="list-inside list-disc text-xs text-slate-600">
          {d.references.map((r) => (
            <li key={r} className="break-all">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RemediationPanel({ finding, canEdit, onSaved }: { finding: FindingDetail; canEdit: boolean; onSaved: () => void }) {
  const drafts = useApi<AiAnalysis[]>(`/findings/${finding.id}/ai`);
  const [text, setText] = useState(finding.remediation ?? '');
  const [editing, setEditing] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(body: { remediation: string } | { analysis_id: string }) {
    setBusy('analysis_id' in body ? body.analysis_id : 'manual');
    setError(null);
    try {
      const { data } = await api<{ remediation: string }>(`/findings/${finding.id}/remediation`, { method: 'PATCH', body });
      setText(data.remediation);
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy('suggest');
    setError(null);
    try {
      const { data } = await api<{ job: Job }>(`/findings/${finding.id}/remediation`, { method: 'POST' });
      setJobId(data.job.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Remediation"
        description="AI drafts are suggestions. Nothing changes until you accept or write the remediation."
        actions={
          canEdit && (
            <>
              <Button size="sm" variant="secondary" onClick={() => void suggest()} loading={busy === 'suggest'}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Suggest fix
              </Button>
              {!editing && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  {finding.remediation ? 'Edit' : 'Write'}
                </Button>
              )}
            </>
          )
        }
      />
      <CardBody className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <JobBanner key={jobId} jobId={jobId} label="AI remediation draft" onDone={() => void drafts.reload()} />
        {editing ? (
          <div className="space-y-2">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} aria-label="Remediation text" />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void save({ remediation: text })} loading={busy === 'manual'} disabled={text.trim().length < 10}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : finding.remediation ? (
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800">{finding.remediation}</pre>
        ) : (
          <p className="text-sm text-slate-500">No remediation yet.</p>
        )}
        {drafts.data?.map((a) => (
          <Draft key={a.id} analysis={a} accepting={busy === a.id} {...(canEdit ? { onAccept: () => void save({ analysis_id: a.id }) } : {})} />
        ))}
      </CardBody>
    </Card>
  );
}
