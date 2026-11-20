// Admin settings. Today only "ai": provider, model and the provider API key.
// The key is encrypted before it reaches the database (AES-256-GCM, scrypt-derived key, see secretBox) and is
// write-only: no endpoint ever returns it, only whether one is stored and its last 4 characters.

import { AI_DEFAULT_MODELS, aiProviderNeedsKey, type AiSettingsInput } from '@tanaw/shared';
import { AI_SETTINGS_KEY, encryptAiKey, resolveAiSettings, secretHint, type ResolvedAiSettings } from '@tanaw/shared/node';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { settingRepository } from '../repositories/setting.repository.js';
import { auditService, type Actor } from './audit.service.js';

export interface AiSettingsView {
  provider: ResolvedAiSettings['provider'];
  model: string;
  needs_key: boolean;
  key_stored: boolean;
  key_hint: string | null;
  configured: boolean;
  problem: string | null;
  updated_at: Date | null;
  updated_by: { id: string; name: string } | null;
}

export interface AiTestResult {
  ok: boolean;
  detail: string;
}

const TEST_TIMEOUT_MS = 10_000;

async function loadResolved() {
  const row = await settingRepository.find(AI_SETTINGS_KEY);
  return { row, resolved: resolveAiSettings(row, env.SETTINGS_ENCRYPTION_KEY) };
}

/** Asks the provider whether it accepts the key, without spending tokens. */
async function probeKey(resolved: ResolvedAiSettings, fetchImpl: typeof fetch): Promise<AiTestResult> {
  if (resolved.provider === 'ollama') {
    return { ok: true, detail: 'Ollama needs no key. The worker reaches it at OLLAMA_URL when a job runs.' };
  }
  const url = resolved.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/key' : 'https://api.openai.com/v1/models';
  const label = resolved.provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
  try {
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${resolved.apiKey ?? ''}` },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, detail: `${label} accepted the key.` };
    if (res.status === 401 || res.status === 403) return { ok: false, detail: `${label} rejected the key (HTTP ${res.status}).` };
    return { ok: false, detail: `${label} answered HTTP ${res.status}. Try again later.` };
  } catch (error) {
    logger.warn('AI key test failed to connect', { provider: resolved.provider, error: (error as Error).name });
    return { ok: false, detail: `Could not reach ${label} (${(error as Error).name}). Check the internet connection.` };
  }
}

export const settingService = {
  /** What the API and worker will use for AI calls. The decrypted key stays inside the process. */
  async resolveAi(): Promise<ResolvedAiSettings> {
    return (await loadResolved()).resolved;
  },

  async getAi(): Promise<AiSettingsView> {
    const { row, resolved } = await loadResolved();
    return {
      provider: resolved.provider,
      model: resolved.model,
      needs_key: aiProviderNeedsKey(resolved.provider),
      key_stored: Boolean(row?.secret),
      key_hint: row?.secret ? row.secret_hint : null,
      configured: resolved.configured,
      problem: resolved.problem,
      updated_at: row?.updated_at ?? null,
      updated_by: row?.updater ?? null,
    };
  },

  async updateAi(input: AiSettingsInput, actor: Actor): Promise<AiSettingsView> {
    const current = await settingRepository.find(AI_SETTINGS_KEY);
    let secret = current?.secret ?? null;
    let secret_hint = current?.secret_hint ?? null;
    let keyChange: 'set' | 'cleared' | 'unchanged' = 'unchanged';
    if (input.api_key) {
      secret = encryptAiKey(input.api_key, env.SETTINGS_ENCRYPTION_KEY);
      secret_hint = secretHint(input.api_key);
      keyChange = 'set';
    } else if (input.clear_key) {
      secret = null;
      secret_hint = null;
      keyChange = 'cleared';
    }
    const model = input.model || AI_DEFAULT_MODELS[input.provider];
    await settingRepository.upsert(AI_SETTINGS_KEY, {
      value: { provider: input.provider, model },
      secret,
      secret_hint,
      updated_by: actor.id ?? null,
    });
    // Never the key itself, not even its hint.
    await auditService.log('settings_updated', actor, { metadata: { setting: 'ai', provider: input.provider, model, key: keyChange } });
    return this.getAi();
  },

  async testAi(fetchImpl: typeof fetch = fetch): Promise<AiTestResult> {
    const resolved = await this.resolveAi();
    if (!resolved.configured) return { ok: false, detail: resolved.problem ?? 'AI is not configured.' };
    return probeKey(resolved, fetchImpl);
  },
};
