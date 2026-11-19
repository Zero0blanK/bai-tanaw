// Structured JSON logs: {level, message, time, meta}. Never pass secrets, tokens, cookies or prompts in meta.

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY_RE = /pass(word)?|secret|token|authorization|cookie|api[_-]?key/i;
const minLevel: Level = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEY_RE.test(k) ? '[REDACTED]' : scrub(v, depth + 1)]),
  );
}

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...(meta ? { meta: scrub(meta) } : {}) });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
