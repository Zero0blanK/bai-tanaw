'use client';

import { CreateTargetBody } from '@tanaw/shared';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty, Spinner } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Target } from '@/types/api';

function CreateTargetForm({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const f = new FormData(formEl);
    const raw = {
      name: f.get('name'),
      base_url: f.get('base_url'),
      description: f.get('description') || undefined,
      authorization_note: f.get('authorization_note') || undefined,
      test_window_start: f.get('test_window_start') || undefined,
      test_window_end: f.get('test_window_end') || undefined,
    };
    const parsed = CreateTargetBody.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api('/targets', { method: 'POST', body: parsed.data });
      formEl.reset();
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" placeholder="Bayaw Jobs (staging)" required />
      </Field>
      <Field label="Base URL" htmlFor="base_url" hint="The host must be on ASSESSMENT_ALLOWED_HOSTS.">
        <Input id="base_url" name="base_url" type="url" placeholder="https://bayawjobs.riomar.dev" required />
      </Field>
      <Field label="Test window start" htmlFor="test_window_start">
        <Input id="test_window_start" name="test_window_start" type="datetime-local" />
      </Field>
      <Field label="Test window end" htmlFor="test_window_end" hint="Scans outside the window are refused.">
        <Input id="test_window_end" name="test_window_end" type="datetime-local" />
      </Field>
      <Field label="Authorization note" htmlFor="authorization_note" className="sm:col-span-2" hint="Who approved testing, and when. Shown in the report.">
        <Textarea id="authorization_note" name="authorization_note" rows={2} />
      </Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <Textarea id="description" name="description" rows={2} />
      </Field>
      {error && (
        <Alert kind="error" className="sm:col-span-2">
          {error}
        </Alert>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={saving}>
          Register target
        </Button>
      </div>
    </form>
  );
}

export default function TargetsPage() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useApi<Target[]>('/targets');
  const [showForm, setShowForm] = useState(false);
  const canEdit = can('ADMIN', 'ASSESSOR');

  return (
    <>
      <PageHeader
        title="Targets"
        description="Authorized applications and their testing boundaries."
        actions={
          canEdit && (
            <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
              <Plus className="h-4 w-4" aria-hidden />
              {showForm ? 'Close' : 'New target'}
            </Button>
          )
        }
      />
      {showForm && (
        <Card className="mb-6">
          <CardHeader title="Register a target" description="Only register applications you have written permission to test." />
          <CardBody>
            <CreateTargetForm
              onCreated={() => {
                setShowForm(false);
                void reload();
              }}
            />
          </CardBody>
        </Card>
      )}
      <Card>
        {loading && !data && <Spinner />}
        {error && (
          <CardBody>
            <Alert kind="error">{error}</Alert>
          </CardBody>
        )}
        {data && data.length === 0 && <Empty title="No targets yet">{canEdit ? 'Register the authorized application to start.' : 'An assessor registers targets.'}</Empty>}
        {data && data.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Base URL</Th>
                <Th>Scope rules</Th>
                <Th>Scans</Th>
                <Th>Findings</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/targets/${t.id}`} className="font-medium text-brand-700 hover:underline">
                      {t.name}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{t.base_url}</Td>
                  <Td>{t._count?.scope_rules ?? 0}</Td>
                  <Td>{t._count?.scans ?? 0}</Td>
                  <Td>{t._count?.findings ?? 0}</Td>
                  <Td>{formatDate(t.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
