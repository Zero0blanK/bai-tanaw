'use client';

import { AddScopeRuleBody, SCOPE_ASSET_TYPES, type ScopeAssetType } from '@tanaw/shared';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Empty } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { Table, Td, Th } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { humanize } from '@/lib/utils';
import type { ScopeRule } from '@/types/api';

const PLACEHOLDER: Record<ScopeAssetType, string> = {
  HOST: 'bayawjobs-api.riomar.dev',
  URL: 'https://bayawjobs.riomar.dev/api',
  PORT_RANGE: '80,443 or 8000-8100',
};

function ScopeTester({ targetId }: { targetId: string }) {
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    const trimmed = value.trim();
    const [hostPart, portPart] = trimmed.split(':');
    const body = /^https?:\/\//i.test(trimmed) ? { url: trimmed } : { host: hostPart, ...(portPart ? { port: Number(portPart) } : {}) };
    try {
      setResult((await api<{ ok: boolean; reason?: string }>(`/targets/${targetId}/scope/check`, { method: 'POST', body })).data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <form onSubmit={check} className="flex flex-wrap items-end gap-2 border-t border-slate-100 px-5 py-4">
      <Field label="Test the scope" htmlFor="scope-test" className="min-w-[16rem] flex-1">
        <Input id="scope-test" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://bayawjobs.riomar.dev/admin" />
      </Field>
      <Button type="submit" variant="secondary" disabled={!value.trim()}>
        Check
      </Button>
      <p className="w-full text-xs text-slate-500">A URL, a host, or host:port. Dry run, nothing is contacted.</p>
      {result && (
        <div className="w-full">
          {result.ok ? <Alert kind="success">In scope.</Alert> : <Alert kind="warning">Out of scope: {result.reason}</Alert>}
        </div>
      )}
      {error && (
        <div className="w-full">
          <Alert kind="error">{error}</Alert>
        </div>
      )}
    </form>
  );
}

export function ScopeRules({ targetId, rules, canEdit, onChange }: { targetId: string; rules: ScopeRule[]; canEdit: boolean; onChange: () => void }) {
  const [assetType, setAssetType] = useState<ScopeAssetType>('HOST');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const f = new FormData(formEl);
    const parsed = AddScopeRuleBody.safeParse({
      asset_type: assetType,
      value: f.get('value'),
      in_scope: f.get('in_scope') === 'in',
      notes: f.get('notes') || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid rule');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/targets/${targetId}/scope`, { method: 'POST', body: parsed.data });
      formEl.reset();
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(rule: ScopeRule) {
    if (!window.confirm(`Delete the ${humanize(rule.asset_type)} rule "${rule.value}"?`)) return;
    try {
      await api(`/targets/${targetId}/scope/${rule.id}`, { method: 'DELETE' });
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Scope rules"
        description="Out-of-scope rules always win. In-scope rules narrow testing to these hosts, ports and URL prefixes, never past the server allowlist."
      />
      {rules.length === 0 ? (
        <Empty title="No rules yet">Only the target's own host is in scope, on any port.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Value</Th>
              <Th>Scope</Th>
              <Th>Notes</Th>
              {canEdit && <Th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <Td>{humanize(r.asset_type)}</Td>
                <Td className="font-mono text-xs">{r.value}</Td>
                <Td>{r.in_scope ? <Badge tone="green">In scope</Badge> : <Badge tone="red">Out of scope</Badge>}</Td>
                <Td className="text-xs text-slate-500">{r.notes ?? ''}</Td>
                {canEdit && (
                  <Td>
                    <button onClick={() => void remove(r)} className="text-slate-400 hover:text-red-600" aria-label={`Delete rule ${r.value}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {canEdit && (
        <CardBody className="border-t border-slate-100">
          <form onSubmit={add} className="grid grid-cols-1 gap-3 sm:grid-cols-[9rem_1fr_9rem_1fr_auto] sm:items-end" noValidate>
            <Field label="Type" htmlFor="asset_type">
              <Select id="asset_type" value={assetType} onChange={(e) => setAssetType(e.target.value as ScopeAssetType)}>
                {SCOPE_ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Value" htmlFor="rule-value">
              <Input id="rule-value" name="value" placeholder={PLACEHOLDER[assetType]} required />
            </Field>
            <Field label="Scope" htmlFor="in_scope">
              <Select id="in_scope" name="in_scope" defaultValue="in">
                <option value="in">In scope</option>
                <option value="out">Out of scope</option>
              </Select>
            </Field>
            <Field label="Notes" htmlFor="rule-notes">
              <Input id="rule-notes" name="notes" placeholder="optional" />
            </Field>
            <Button type="submit" loading={saving}>
              Add rule
            </Button>
          </form>
          {error && (
            <Alert kind="error" className="mt-3">
              {error}
            </Alert>
          )}
        </CardBody>
      )}
      <ScopeTester targetId={targetId} />
    </Card>
  );
}
