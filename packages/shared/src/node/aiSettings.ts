// Turns the stored "ai" settings row into what the worker needs to call a provider, and what the API needs to
// decide whether AI is usable. Both apps call this, so they agree on "configured".

import { z } from 'zod';
import { AI_DEFAULT_MODELS, AI_PROVIDERS, aiProviderNeedsKey, type AiProvider } from '../enums/index.js';
import { decryptSecret, encryptSecret, SecretDecryptError } from './secretBox.js';

export const AI_SETTINGS_KEY = 'ai';
/** AAD purpose for the encrypted key, so the blob can't be reused for another setting. */
export const AI_KEY_PURPOSE = 'settings.ai.api_key';

const StoredValue = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1),
});

export interface AiSettingsRow {
  value: unknown;
  secret: string | null;
}

export interface ResolvedAiSettings {
  provider: AiProvider;
  model: string;
  /** Decrypted key, only inside the process that needs it. Never log or return it. */
  apiKey: string | null;
  /** True when the provider can be called (has a key, or needs none). */
  configured: boolean;
  /** Why it isn't configured, in words an admin can act on. */
  problem: string | null;
}

export const DEFAULT_AI_PROVIDER: AiProvider = 'openrouter';

export function resolveAiSettings(row: AiSettingsRow | null, masterKey: string): ResolvedAiSettings {
  const parsed = StoredValue.safeParse(row?.value);
  const provider = parsed.success ? parsed.data.provider : DEFAULT_AI_PROVIDER;
  const model = parsed.success ? parsed.data.model : AI_DEFAULT_MODELS[provider];

  let apiKey: string | null = null;
  let problem: string | null = null;
  if (row?.secret) {
    try {
      apiKey = decryptSecret(row.secret, masterKey, AI_KEY_PURPOSE);
    } catch (error) {
      if (!(error instanceof SecretDecryptError)) throw error;
      problem = 'The stored API key can no longer be decrypted (SETTINGS_ENCRYPTION_KEY changed). Enter it again in Settings.';
    }
  }
  if (!problem && aiProviderNeedsKey(provider) && !apiKey) {
    problem = 'No API key yet. An admin can add one in Settings.';
  }
  return { provider, model, apiKey: aiProviderNeedsKey(provider) ? apiKey : null, configured: problem === null, problem };
}

export function encryptAiKey(apiKey: string, masterKey: string): string {
  return encryptSecret(apiKey, masterKey, AI_KEY_PURPOSE);
}
