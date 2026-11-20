'use client';

import { RUNNABLE_TOOLS, type RunnableTool } from '@tanaw/shared';
import { Play, Upload } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { JobBanner } from '@/components/shared/job-banner';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import type { Job, Scan } from '@/types/api';

const TOOL_INFO: Record<RunnableTool, { label: string; help: string; fields: Array<'url' | 'host' | 'ports'> }> = {
  HTTP_CHECK: { label: 'HTTP check', help: 'Security headers, cookie flags, CORS and HTTPS redirect for one URL.', fields: ['url'] },
  DNS: { label: 'DNS lookup', help: 'A, AAAA, CNAME, MX, TXT, NS and CAA records.', fields: ['host'] },
  OPENAPI: { label: 'OpenAPI endpoints', help: "Lists the API's endpoints from its OpenAPI spec (default: <origin>/api/docs/openapi.json).", fields: ['url'] },
  NMAP: { label: 'Nmap', help: 'Service detection (-sV -T3) on the given ports. No scripts, no attacks.', fields: ['host', 'ports'] },
  ZAP: { label: 'OWASP ZAP', help: 'Spider + passive scan, limited to the URL. Active scanning stays off.', fields: ['url'] },
};

export function ScanLauncher({ targetId, baseUrl, onFinished }: { targetId: string; baseUrl: string; onFinished: () => void }) {
  const [tool, setTool] = useState<RunnableTool>('HTTP_CHECK');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const info = TOOL_INFO[tool];
  const host = (() => {
    try {
      return new URL(baseUrl).hostname;
    } catch {
      return '';
    }
  })();

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const body: Record<string, string> = { tool };
    for (const field of info.fields) {
      const v = String(f.get(field) ?? '').trim();
      if (v) body[field] = v;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api<{ scan: Scan; job: Job }>(`/targets/${targetId}/scans`, { method: 'POST', body });
      setJobId(data.job.id);
      onFinished();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Run one tool" description="Every host, URL and port is checked against the scope before anything runs, and again by the worker. Results become findings automatically." />
      <CardBody className="space-y-3">
        <form onSubmit={start} className="grid grid-cols-1 gap-3 sm:grid-cols-2" noValidate>
          <Field label="Tool" htmlFor="tool" hint={info.help} className="sm:col-span-2">
            <Select id="tool" value={tool} onChange={(e) => setTool(e.target.value as RunnableTool)}>
              {RUNNABLE_TOOLS.map((t) => (
                <option key={t} value={t}>
                  {TOOL_INFO[t].label}
                </option>
              ))}
            </Select>
          </Field>
          {info.fields.includes('url') && (
            <Field label="URL" htmlFor="scan-url" className="sm:col-span-2" hint="Leave empty for the default.">
              <Input id="scan-url" name="url" type="url" placeholder={tool === 'OPENAPI' ? `${new URL(baseUrl).origin}/api/docs/openapi.json` : baseUrl} />
            </Field>
          )}
          {info.fields.includes('host') && (
            <Field label="Host" htmlFor="scan-host">
              <Input id="scan-host" name="host" placeholder={host} />
            </Field>
          )}
          {info.fields.includes('ports') && (
            <Field label="Ports" htmlFor="scan-ports" hint="At most 1024 ports.">
              <Input id="scan-ports" name="ports" placeholder="80,443" />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving}>
              <Play className="h-4 w-4" aria-hidden />
              Start {info.label}
            </Button>
          </div>
        </form>
        {error && <Alert kind="error">{error}</Alert>}
        <JobBanner key={jobId} jobId={jobId} label="Scan" onDone={() => onFinished()} />
      </CardBody>
    </Card>
  );
}

export function ReportImport({ targetId, onImported }: { targetId: string; onImported: () => void }) {
  const [tool, setTool] = useState<'nmap' | 'zap'>('nmap');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Choose a report file first');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const { data } = await api<{ results: number; findings_created: number; ai: { queued: boolean } }>(`/targets/${targetId}/imports/${tool}`, { method: 'POST', form });
      setNotice(`Imported ${data.results} results and created ${data.findings_created} new findings.${data.ai.queued ? ' The AI is reading the report now.' : ''}`);
      if (fileRef.current) fileRef.current.value = '';
      onImported();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Import a report" description="Nmap XML (-oX) or ZAP Traditional JSON. If any host in the file is out of scope, nothing is imported." />
      <CardBody className="space-y-3">
        <form onSubmit={upload} className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Field label="Format" htmlFor="import-tool">
            <Select id="import-tool" value={tool} onChange={(e) => setTool(e.target.value as 'nmap' | 'zap')}>
              <option value="nmap">Nmap XML</option>
              <option value="zap">ZAP JSON</option>
            </Select>
          </Field>
          <Field label="File" htmlFor="import-file">
            <Input id="import-file" ref={fileRef} type="file" accept={tool === 'nmap' ? '.xml,application/xml,text/xml' : '.json,application/json'} className="py-1.5" />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            <Upload className="h-4 w-4" aria-hidden />
            Import
          </Button>
        </form>
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
      </CardBody>
    </Card>
  );
}
