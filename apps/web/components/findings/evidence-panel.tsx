'use client';

import { EVIDENCE_TYPES, type EvidenceType } from '@tanaw/shared';
import { Download, Paperclip } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ResultSummary } from '@/components/scans/result-row';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api, apiBlob, downloadFile, errorMessage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/utils';
import type { Evidence } from '@/types/api';

/** Images are fetched with the access token and shown through an object URL. */
export function EvidenceImage({ evidenceId, alt }: { evidenceId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    apiBlob(`/evidence/${evidenceId}/file`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidenceId]);
  if (failed) return <p className="text-xs text-red-600">Could not load the image.</p>;
  if (!url) return <div className="h-24 w-40 animate-pulse rounded bg-slate-100" />;
  // A plain <img>: the source is an authenticated blob URL, not a static asset next/image could optimize.
  return <img src={url} alt={alt} className="max-h-96 rounded border border-slate-200" />;
}

export function EvidenceItem({ evidence }: { evidence: Evidence }) {
  const isImage = evidence.type === 'SCREENSHOT' && evidence.file_path;
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Badge tone="brand">{humanize(evidence.type)}</Badge>
        {evidence.creator?.name ?? 'system'} · {formatDateTime(evidence.created_at)}
      </div>
      {evidence.scan_result && (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <ResultSummary type={evidence.scan_result.type} data={evidence.scan_result.data} />
        </div>
      )}
      {evidence.content && !evidence.scan_result && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 px-3 py-2 text-xs text-slate-100">{evidence.content}</pre>}
      {isImage && <EvidenceImage evidenceId={evidence.id} alt={`Screenshot evidence ${evidence.id}`} />}
      {evidence.file_path && !isImage && (
        <Button size="sm" variant="secondary" onClick={() => void downloadFile(`/evidence/${evidence.id}/file`, `evidence-${evidence.id}.txt`)}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download file
        </Button>
      )}
    </li>
  );
}

export function EvidencePanel({ findingId, evidence, canEdit, onAdded }: { findingId: string; evidence: Evidence[]; canEdit: boolean; onAdded: () => void }) {
  const [type, setType] = useState<EvidenceType>('HTTP_EXCHANGE');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const content = String(new FormData(formEl).get('content') ?? '').trim();
    const file = fileRef.current?.files?.[0];
    const form = new FormData();
    form.append('type', type);
    if (content) form.append('content', content);
    if (file) form.append('file', file);
    setSaving(true);
    setError(null);
    try {
      await api(`/findings/${findingId}/evidence`, { method: 'POST', form });
      formEl.reset();
      onAdded();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title={`Evidence (${evidence.length})`} description="Real technical proof. Pasted text is redacted (tokens, cookies, emails) before it is stored." />
      {evidence.length === 0 ? (
        <Empty title="No evidence yet">A finding can't be confirmed without evidence.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 px-5">
          {evidence.map((e) => (
            <EvidenceItem key={e.id} evidence={e} />
          ))}
        </ul>
      )}
      {canEdit && (
        <CardBody className="border-t border-slate-100">
          <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="ev-type">
              <Select id="ev-type" value={type} onChange={(e) => setType(e.target.value as EvidenceType)}>
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={type === 'SCREENSHOT' ? 'Image (PNG, JPEG, WebP)' : 'File (optional, text)'} htmlFor="ev-file">
              <Input id="ev-file" ref={fileRef} type="file" accept={type === 'SCREENSHOT' ? 'image/png,image/jpeg,image/webp' : '.txt,.json,.xml,.har,.log,text/plain'} className="py-1.5" />
            </Field>
            {type !== 'SCREENSHOT' && (
              <Field label="Content" htmlFor="ev-content" className="sm:col-span-2" hint="For example the raw HTTP request and response from Burp or curl -i.">
                <Textarea id="ev-content" name="content" rows={5} className="font-mono text-xs" />
              </Field>
            )}
            {error && (
              <Alert kind="error" className="sm:col-span-2">
                {error}
              </Alert>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" loading={saving}>
                <Paperclip className="h-4 w-4" aria-hidden />
                Add evidence
              </Button>
            </div>
          </form>
        </CardBody>
      )}
    </Card>
  );
}
