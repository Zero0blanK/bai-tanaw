'use client';

import { VerifyFindingBody } from '@tanaw/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, fieldDescribedBy, issuesByField, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';

export type QuickDecision = 'REJECTED' | 'FALSE_POSITIVE';

const COPY: Record<QuickDecision, { title: string; label: string; hint: string }> = {
  REJECTED: {
    title: 'Reject this finding?',
    label: 'Reject finding',
    hint: 'Say why it is not a vulnerability here, e.g. "The header is set by the CDN in production; checked on the live response."',
  },
  FALSE_POSITIVE: {
    title: 'Mark as false positive?',
    label: 'Mark false positive',
    hint: 'Say what the tool or AI got wrong, e.g. "The cookie is HttpOnly; the scan read a cached response."',
  },
};

/**
 * The two decisions that need no evidence: rejecting and marking a false positive. Notes are required (the API
 * refuses a decision without them) and go into the finding's verification history. Confirming needs severity,
 * CVSS and evidence, so it happens on the finding's own page.
 */
export function DecisionDialog({ findingId, title, decision, onClose, onDone }: { findingId: string; title: string; decision: QuickDecision | null; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const copy = decision ? COPY[decision] : COPY.REJECTED;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    const parsed = VerifyFindingBody.safeParse({ status: decision, notes: new FormData(event.currentTarget).get('notes') });
    if (!parsed.success) {
      setFieldError(issuesByField(parsed.error.issues).notes);
      return;
    }
    setFieldError(undefined);
    setError(null);
    setSaving(true);
    try {
      await api(`/findings/${findingId}/verify`, { method: 'PATCH', body: parsed.data });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const close = () => {
    setError(null);
    setFieldError(undefined);
    onClose();
  };

  return (
    <Dialog
      open={decision !== null}
      onClose={close}
      title={copy.title}
      description={title}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="quick-decision" variant="destructive" loading={saving}>
            {copy.label}
          </Button>
        </>
      }
    >
      <form id="quick-decision" onSubmit={submit} noValidate className="space-y-3">
        <Field label="Notes for the record" htmlFor="decision-notes" required hint={copy.hint} error={fieldError}>
          <Textarea
            id="decision-notes"
            name="notes"
            rows={4}
            required
            data-autofocus=""
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldDescribedBy('decision-notes', { hint: true, error: fieldError })}
          />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
      </form>
    </Dialog>
  );
}
