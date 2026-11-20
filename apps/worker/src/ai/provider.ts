// One entry point for both AI features. OpenRouter or OpenAI (Structured Outputs, strict JSON schema), or Ollama.
// The provider, model and API key come from Settings (app_settings; the key is stored encrypted and decrypted only
// here, per job). The AI is read-only: it gets data and returns JSON, it has no tools.

import type { AiProvider } from '@tanaw/shared';
import { AI_SETTINGS_KEY, resolveAiSettings } from '@tanaw/shared/node';
import type { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/prisma.js';
import { AiBadOutputError, AiNotConfiguredError, AiProviderError } from './errors.js';
import { buildUserMessage } from './input.js';

export const AI_TIMEOUT_MS = 60_000;
export const AI_TEMPERATURE = 0.2;

export interface AskJsonOptions<T> {
  /** Short name for logs and the JSON schema name, e.g. "interpret". */
  task: 'interpret' | 'remediate';
  system: string;
  /** Untrusted tool output: redacted, capped and wrapped before sending. */
  untrusted: string;
  /** Trusted context placed outside the <tool_output> block (e.g. stack facts). */
  context?: string | undefined;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
}

export interface AskJsonResult<T> {
  result: T;
  provider: AiProvider;
  model: string;
  inputHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface ProviderConfig {
  provider: AiProvider;
  model: string;
  /** Decrypted key; never logged. */
  apiKey?: string | null | undefined;
  /** Why the settings aren't usable, if they aren't. */
  problem?: string | null | undefined;
  ollamaUrl: string;
  maxInputChars: number;
  fetchImpl?: typeof fetch;
}

/** Reads Settings from the database and decrypts the key. Called per job, so a new key applies at once. */
export async function loadProviderConfig(): Promise<ProviderConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: AI_SETTINGS_KEY } });
  const resolved = resolveAiSettings(row, env.SETTINGS_ENCRYPTION_KEY);
  return {
    provider: resolved.provider,
    model: resolved.model,
    apiKey: resolved.apiKey,
    problem: resolved.problem,
    ollamaUrl: env.OLLAMA_URL,
    maxInputChars: env.AI_MAX_INPUT_CHARS,
  };
}

/** Reasoning models (o-series, gpt-5*) reject a custom temperature. OpenRouter ids carry a vendor prefix. */
export function supportsTemperature(model: string): boolean {
  const name = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  return !/^(o\d|gpt-5)/i.test(name);
}

interface RawReply {
  content: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

const CHAT_ENDPOINTS = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', label: 'OpenAI' },
  openrouter: { url: 'https://openrouter.ai/api/v1/chat/completions', label: 'OpenRouter' },
} as const;

/** OpenAI and OpenRouter share the Chat Completions format. */
async function callChatCompletions(
  cfg: ProviderConfig,
  provider: 'openai' | 'openrouter',
  system: string,
  user: string,
  name: string,
  jsonSchema: Record<string, unknown>,
): Promise<RawReply> {
  if (!cfg.apiKey) throw new AiNotConfiguredError(cfg.problem ?? undefined);
  const { url, label } = CHAT_ENDPOINTS[provider];
  const model = cfg.model;
  const res = await (cfg.fetchImpl ?? fetch)(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.apiKey}`,
      'content-type': 'application/json',
      // OpenRouter shows this app name on its dashboard; it carries no user data.
      ...(provider === 'openrouter' ? { 'x-title': 'Bai-Tanaw' } : {}),
    },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      ...(supportsTemperature(model) ? { temperature: AI_TEMPERATURE } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: jsonSchema } },
      // Only route to OpenRouter providers that honour response_format, or the strict schema would be ignored.
      ...(provider === 'openrouter' ? { provider: { require_parameters: true } } : {}),
    }),
  });
  if (!res.ok) {
    // Log the provider's message, never the request (it carries the key).
    const detail = await res.text().catch(() => '');
    logger.error(`${label} request failed`, { status: res.status, detail: detail.slice(0, 300) });
    if (res.status === 401 || res.status === 403) {
      throw new AiNotConfiguredError(`${label} rejected the API key (HTTP ${res.status}). An admin can replace it in Settings.`);
    }
    throw new AiProviderError(`${label} returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    model?: string;
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  if (body.error) throw new AiProviderError(`${label} error: ${String(body.error.message ?? 'unknown').slice(0, 200)}`);
  const message = body.choices?.[0]?.message;
  if (message?.refusal) throw new AiProviderError(`${label} refused: ${message.refusal.slice(0, 200)}`);
  return {
    content: message?.content ?? '',
    model: body.model ?? model,
    tokensIn: body.usage?.prompt_tokens ?? null,
    tokensOut: body.usage?.completion_tokens ?? null,
  };
}

async function callOllama(cfg: ProviderConfig, system: string, user: string, jsonSchema: Record<string, unknown>): Promise<RawReply> {
  const model = cfg.model;
  const res = await (cfg.fetchImpl ?? fetch)(new URL('/api/chat', cfg.ollamaUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      stream: false,
      format: jsonSchema,
      options: { temperature: AI_TEMPERATURE },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new AiProviderError(`Ollama returned HTTP ${res.status}`);
  const body = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
  return { content: body.message?.content ?? '', model, tokensIn: body.prompt_eval_count ?? null, tokensOut: body.eval_count ?? null };
}

export async function askJson<T>(options: AskJsonOptions<T>, config?: ProviderConfig): Promise<AskJsonResult<T>> {
  const cfg = config ?? (await loadProviderConfig());
  const { message, inputHash, truncated } = buildUserMessage(options.untrusted, cfg.maxInputChars, options.context);
  const raw =
    cfg.provider === 'ollama'
      ? await callOllama(cfg, options.system, message, options.jsonSchema)
      : await callChatCompletions(cfg, cfg.provider, options.system, message, `tanaw_${options.task}`, options.jsonSchema);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.content);
  } catch {
    throw new AiBadOutputError('AI reply was not valid JSON');
  }
  const checked = options.schema.safeParse(parsed);
  if (!checked.success) {
    logger.warn('AI reply failed the schema check', { task: options.task, issues: checked.error.issues.slice(0, 5) });
    throw new AiBadOutputError();
  }

  logger.info('AI call finished', { task: options.task, provider: cfg.provider, model: raw.model, tokens_in: raw.tokensIn, tokens_out: raw.tokensOut, truncated });
  return { result: checked.data, provider: cfg.provider, model: raw.model, inputHash, tokensIn: raw.tokensIn, tokensOut: raw.tokensOut };
}

export type AskJson = typeof askJson;
