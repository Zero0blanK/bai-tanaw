'use client';

import { CreateFindingBody, FINDING_CATEGORIES } from '@tanaw/shared';
import { useState, type FormEvent } from 'react';
import { CATEGORY_LABEL } from '@/components/shared/badges';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import type { Finding, Target } from '@/types/api';

export function ManualFindingForm({ targets, defaultTargetId, onCreated }: { targets: Target[]; defaultTargetId?: string; onCreated: (id: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const parsed = CreateFindingBody.safeParse({
      target_id: f.get('target_id'),
      title: f.get('title'),
      category: f.get('category'),
      description: f.get('description'),
      affected_asset: f.get('affected_asset'),
      owasp_top10: f.get('owasp_top10') || undefined,
      wstg_id: f.get('wstg_id') || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api<Finding>('/findings', { method: 'POST', body: parsed.data });
      onCreated(data.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <Field label="Target" htmlFor="mf-target">
        <Select id="mf-target" name="target_id" defaultValue={defaultTargetId || targets[0]?.id}>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Category" htmlFor="mf-category">
        <Select id="mf-category" name="category">
          {FINDING_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" htmlFor="mf-title" className="sm:col-span-2">
        <Input id="mf-title" name="title" placeholder="IDOR on GET /api/applications/:id" />
      </Field>
      <Field label="Affected asset" htmlFor="mf-asset" className="sm:col-span-2">
        <Input id="mf-asset" name="affected_asset" placeholder="https://bayawjobs-api.riomar.dev/api/applications/:id" />
      </Field>
      <Field label="Description" htmlFor="mf-description" className="sm:col-span-2" hint="What you did, what happened, why it matters. Test accounts only.">
        <Textarea id="mf-description" name="description" rows={4} />
      </Field>
      <Field label="OWASP Top 10:2021" htmlFor="mf-owasp">
        <Input id="mf-owasp" name="owasp_top10" placeholder="A01:2021 Broken Access Control" />
      </Field>
      <Field label="WSTG test ID" htmlFor="mf-wstg">
        <Input id="mf-wstg" name="wstg_id" placeholder="WSTG-ATHZ-04" />
      </Field>
      {error && (
        <Alert kind="error" className="sm:col-span-2">
          {error}
        </Alert>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={saving}>
          Create finding
        </Button>
      </div>
    </form>
  );
}
