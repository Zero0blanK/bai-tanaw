// One entry point for both AI features. OpenAI (Structured Outputs, strict JSON schema) by default;
// Ollama as a local fallback. The AI is read-only: it gets data and returns JSON, it has no tools.

import type { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
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
  provider: 'openai' | 'ollama';
  model: string;
  inputHash: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

export interface ProviderConfig {
  provider: 'openai' | 'ollama';
  openaiApiKey?: string | undefined;
  openaiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  maxInputChars: number;
  fetchImpl?: typeof fetch;
}

export function configFromEnv(): ProviderConfig {
  return {
    provider: env.AI_PROVIDER,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    ollamaUrl: env.OLLAMA_URL,
    ollamaModel: env.OLLAMA_MODEL,
    maxInputChars: env.AI_MAX_INPUT_CHARS,
  };
}

/** Reasoning models (o-series, gpt-5*) reject a custom temperature. */
export function supportsTemperature(model: string): boolean {
  return !/^(o\d|gpt-5)/i.test(model);
}

interface RawReply {
  content: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
}

async function callOpenAI(cfg: ProviderConfig, system: string, user: string, name: string, jsonSchema: Record<string, unknown>): Promise<RawReply> {
  if (!cfg.openaiApiKey) throw new AiNotConfiguredError();
  const model = cfg.openaiModel;
  const res = await (cfg.fetchImpl ?? fetch)('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${cfg.openaiApiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      ...(supportsTemperature(model) ? { temperature: AI_TEMPERATURE } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: jsonSchema } },
    }),
  });
  if (!res.ok) {
    // Log the provider's message, never the request (it carries the key).
    const detail = await res.text().catch(() => '');
    logger.error('OpenAI request failed', { status: res.status, detail: detail.slice(0, 300) });
    throw new AiProviderError(`OpenAI returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const message = body.choices?.[0]?.message;
  if (message?.refusal) throw new AiProviderError(`OpenAI refused: ${message.refusal.slice(0, 200)}`);
  return {
    content: message?.content ?? '',
    model: body.model ?? model,
    tokensIn: body.usage?.prompt_tokens ?? null,
    tokensOut: body.usage?.completion_tokens ?? null,
  };
}

async function callOllama(cfg: ProviderConfig, system: string, user: string, jsonSchema: Record<string, unknown>): Promise<RawReply> {
  const model = cfg.ollamaModel;
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

export async function askJson<T>(options: AskJsonOptions<T>, cfg: ProviderConfig = configFromEnv()): Promise<AskJsonResult<T>> {
  const { message, inputHash, truncated } = buildUserMessage(options.untrusted, cfg.maxInputChars, options.context);
  const raw =
    cfg.provider === 'ollama'
      ? await callOllama(cfg, options.system, message, options.jsonSchema)
      : await callOpenAI(cfg, options.system, message, `tanaw_${options.task}`, options.jsonSchema);

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
