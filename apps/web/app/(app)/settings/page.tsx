'use client';

import { AI_DEFAULT_MODELS, AI_PROVIDERS, AiSettingsBody, aiProviderNeedsKey, type AiProvider } from '@tanaw/shared';
import { KeyRound, Lock, PlugZap } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/shared/auth-provider';
import { PageHeader } from '@/components/shared/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { useConfirm } from '@/components/ui/confirm';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

interface AiSettings {
  provider: AiProvider;
  model: string;
  needs_key: boolean;
  key_stored: boolean;
  key_hint: string | null;
  configured: boolean;
  problem: string | null;
  updated_at: string | null;
  updated_by: { id: string; name: string } | null;
}

const PROVIDER_LABEL: Record<AiProvider, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  ollama: 'Ollama (local)',
};

const MODEL_HINT: Record<AiProvider, string> = {
  openrouter: 'An OpenRouter model id that supports structured outputs, e.g. openai/gpt-4.1-mini.',
  openai: 'An OpenAI model id, e.g. gpt-4.1-mini.',
  ollama: 'A model pulled into Ollama, e.g. llama3.1:8b. The worker reaches Ollama at OLLAMA_URL.',
};

const KEY_PLACEHOLDER: Record<AiProvider, string> = {
  openrouter: 'sk-or-v1-…',
  openai: 'sk-…',
  ollama: '',
};

function AiSettingsCard() {
  const settings = useApi<AiSettings>('/settings/ai');
  const [provider, setProvider] = useState<AiProvider>('openrouter');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const current = settings.data;
  useEffect(() => {
    if (!current) return;
    setProvider(current.provider);
    setModel(current.model);
  }, [current]);

  async function save(body: unknown, message: string) {
    const parsed = AiSettingsBody.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api('/settings/ai', { method: 'PUT', body: parsed.data });
      // The key leaves the browser once; drop it from memory right away.
      setApiKey('');
      toast({ title: 'AI settings saved', body: message });
      await settings.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = apiKey.trim();
    void save(
      { provider, model: model.trim() || AI_DEFAULT_MODELS[provider], ...(key ? { api_key: key } : {}) },
      key ? 'The key was encrypted and stored. It will not be shown again.' : 'Provider and model updated.',
    );
  }

  async function test() {
    setTesting(true);
    setNotice(null);
    setError(null);
    try {
      const { data } = await api<{ ok: boolean; detail: string }>('/settings/ai/test', { method: 'POST' });
      setNotice({ kind: data.ok ? 'success' : 'error', text: data.detail });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  async function removeKey() {
    const ok = await confirm({
      title: 'Remove the stored API key?',
      body: 'Automatic AI interpretation and "Suggest fix" stop until a new key is saved. The encrypted key is deleted and cannot be recovered from Bai-Tanaw.',
      confirmLabel: 'Remove key',
      tone: 'danger',
    });
    if (!ok) return;
    void save({ provider, model: model.trim() || AI_DEFAULT_MODELS[provider], clear_key: true }, 'The stored key was deleted.');
  }

  if (settings.loading && !current) return <Spinner />;
  if (settings.error) return <Alert kind="error">{settings.error}</Alert>;

  const needsKey = aiProviderNeedsKey(provider);

  return (
    <Card>
      <CardHeader
        title="AI provider"
        description="Used by Interpret with AI and Suggest fix. Tool output is redacted before it is sent."
        actions={
          current &&
          (current.configured ? <Badge tone="green">Ready</Badge> : <Badge tone="amber">Not set up</Badge>)
        }
      />
      <CardBody className="space-y-4">
        {current?.problem && <Alert kind="warning">{current.problem}</Alert>}
        <form onSubmit={submit} className="grid max-w-xl grid-cols-1 gap-4" noValidate>
          <Field label="Provider" htmlFor="ai-provider">
            <Select
              id="ai-provider"
              value={provider}
              onChange={(e) => {
                const next = e.target.value as AiProvider;
                setProvider(next);
                if (!model || Object.values(AI_DEFAULT_MODELS).includes(model)) setModel(AI_DEFAULT_MODELS[next]);
              }}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Model" htmlFor="ai-model" hint={MODEL_HINT[provider]}>
            <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          {needsKey && (
            <Field
              label="API key"
              htmlFor="ai-key"
              hint={
                current?.key_stored
                  ? `A key ending in ${current.key_hint ?? '…'} is stored. Paste a new one to replace it, or leave this empty to keep it.`
                  : 'Paste the key. It is encrypted on the server before it is stored and is never shown again.'
              }
            >
              <Input
                id="ai-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={current?.key_stored ? `Stored (${current.key_hint ?? '…'})` : KEY_PLACEHOLDER[provider]}
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
              />
            </Field>
          )}
          {error && <Alert kind="error">{error}</Alert>}
          {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={saving}>
              <Lock className="h-4 w-4" aria-hidden />
              Save
            </Button>
            <Button variant="secondary" onClick={() => void test()} loading={testing} disabled={saving || !current?.configured}>
              <PlugZap className="h-4 w-4" aria-hidden />
              Test connection
            </Button>
            {current?.key_stored && (
              <Button variant="danger" onClick={() => void removeKey()} disabled={saving}>
                <KeyRound className="h-4 w-4" aria-hidden />
                Remove key
              </Button>
            )}
          </div>
        </form>
        <p className="text-xs text-ink-500">
          The key is encrypted with AES-256-GCM using a key derived (scrypt) from the server&apos;s SETTINGS_ENCRYPTION_KEY,
          and only the worker decrypts it, per AI job. Nobody can read it back through the app; only its last 4
          characters are shown.
          {current?.updated_at && (
            <>
              {' '}
              Last changed {formatDateTime(current.updated_at)}
              {current.updated_by ? ` by ${current.updated_by.name}` : ''}.
            </>
          )}
        </p>
      </CardBody>
    </Card>
  );
}

export default function SettingsPage() {
  const { can } = useAuth();
  if (!can('ADMIN')) return <Alert kind="error">Only admins can change settings.</Alert>;
  return (
    <>
      <PageHeader title="Settings" description="Platform settings. Changes are recorded in the audit log." />
      <AiSettingsCard />
    </>
  );
}
