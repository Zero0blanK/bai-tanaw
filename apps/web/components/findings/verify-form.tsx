'use client';

import { cvss31BaseScore, cvssSeverity, SEVERITIES, VerifyFindingBody, type FindingStatus, type Severity } from '@tanaw/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { humanize } from '@/lib/utils';
import type { FindingDetail } from '@/types/api';

const HELP: Partial<Record<FindingStatus, string>> = {
  CONFIRMED: 'You reproduced it. Needs a final severity, a CVSS v3.1 score or vector, and at least one piece of evidence.',
  REJECTED: 'Not a real issue for this target (out of the three categories, or not applicable).',
  FALSE_POSITIVE: 'The tool or AI was wrong: you checked and the behaviour is safe.',
  FIXED: 'You retested after the fix and the issue is gone. Say how you retested.',
};

export function VerifyForm({ finding, onSaved }: { finding: FindingDetail; onSaved: () => void }) {
  const options = finding.allowed_transitions;
  const [status, setStatus] = useState<FindingStatus>(options[0] ?? 'CONFIRMED');
  // Start from the suggested vector (tool rule or AI) so the score is ready; the assessor can change it.
  const [vector, setVector] = useState(finding.cvss_vector ?? finding.suggested_cvss_vector ?? '');
  const [score, setScore] = useState(finding.cvss_score !== null ? String(finding.cvss_score) : '');
  const [severity, setSeverity] = useState<Severity | ''>(finding.final_severity ?? finding.ai_severity ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const computed = vector.trim() ? cvss31BaseScore(vector) : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const confirming = status === 'CONFIRMED';
    const parsed = VerifyFindingBody.safeParse({
      status,
      notes: f.get('notes'),
      ...(confirming && severity ? { final_severity: severity } : {}),
      ...(confirming && vector.trim() ? { cvss_vector: vector.trim() } : {}),
      ...(confirming && score.trim() && !vector.trim() ? { cvss_score: Number(score) } : {}),
      ...(confirming && f.get('owasp_top10') ? { owasp_top10: f.get('owasp_top10') } : {}),
      ...(confirming && f.get('wstg_id') ? { wstg_id: f.get('wstg_id') } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/findings/${finding.id}/verify`, { method: 'PATCH', body: parsed.data });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (options.length === 0) return null;

  return (
    <Card>
      <CardHeader title="Verify" description="Your decision is logged with your name and notes. AI and tools can never do this step." />
      <CardBody>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="Decision" htmlFor="v-status" hint={HELP[status]} className="sm:col-span-2">
            <Select id="v-status" value={status} onChange={(e) => setStatus(e.target.value as FindingStatus)}>
              {options.map((o) => (
                <option key={o} value={o}>
                  {humanize(o)}
                </option>
              ))}
            </Select>
          </Field>
          {status === 'CONFIRMED' && (
            <>
              <Field
                label="CVSS v3.1 vector"
                htmlFor="v-vector"
                className="sm:col-span-2"
                hint={
                  vector.trim()
                    ? computed === null
                      ? 'Not a valid CVSS:3.1 base vector.'
                      : `Scores ${computed} (${humanize(cvssSeverity(computed))}). The score is computed from the vector.`
                    : 'Optional if you enter a score. Example: CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N'
                }
              >
                <Input id="v-vector" value={vector} onChange={(e) => setVector(e.target.value)} className="font-mono text-xs" placeholder="CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N" />
              </Field>
              <Field label="CVSS score" htmlFor="v-score">
                <Input id="v-score" type="number" min={0} max={10} step={0.1} value={computed ?? score} disabled={computed !== null} onChange={(e) => setScore(e.target.value)} />
              </Field>
              <Field label="Final severity" htmlFor="v-severity" hint={finding.ai_severity ? `Suggested: ${humanize(finding.ai_severity)}.` : undefined}>
                <Select id="v-severity" value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
                  <option value="">Choose…</option>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="OWASP Top 10:2021" htmlFor="v-owasp">
                <Input id="v-owasp" name="owasp_top10" defaultValue={finding.owasp_top10 ?? ''} />
              </Field>
              <Field label="WSTG test ID" htmlFor="v-wstg">
                <Input id="v-wstg" name="wstg_id" defaultValue={finding.wstg_id ?? ''} />
              </Field>
            </>
          )}
          <Field label="Notes" htmlFor="v-notes" className="sm:col-span-2" hint="How you verified it (tool, request, accounts used). Required.">
            <Textarea id="v-notes" name="notes" rows={3} />
          </Field>
          {error && (
            <Alert kind="error" className="sm:col-span-2">
              {error}
            </Alert>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving} variant={status === 'CONFIRMED' ? 'danger' : 'primary'}>
              Save decision: {humanize(status)}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
