import { describe, expect, it } from 'vitest';
import { encryptAiKey, resolveAiSettings } from './aiSettings.js';
import { decryptSecret, encryptSecret, SecretDecryptError, secretHint } from './secretBox.js';

const MASTER = 'test-master-key-0123456789abcdefghijklmnop';
const PURPOSE = 'settings.ai.api_key';
const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef';

describe('secretBox', () => {
  it('round-trips and never stores the plaintext', () => {
    const blob = encryptSecret(KEY, MASTER, PURPOSE);
    expect(blob.startsWith('v1.')).toBe(true);
    expect(blob).not.toContain(KEY);
    expect(blob).not.toContain('sk-or');
    expect(decryptSecret(blob, MASTER, PURPOSE)).toBe(KEY);
  });

  it('uses a fresh salt and IV every time', () => {
    expect(encryptSecret(KEY, MASTER, PURPOSE)).not.toBe(encryptSecret(KEY, MASTER, PURPOSE));
  });

  it('refuses a wrong master key, another purpose, or tampered data', () => {
    const blob = encryptSecret(KEY, MASTER, PURPOSE);
    expect(() => decryptSecret(blob, `${MASTER}x`, PURPOSE)).toThrow(SecretDecryptError);
    expect(() => decryptSecret(blob, MASTER, 'settings.other')).toThrow(SecretDecryptError);
    const parts = blob.split('.');
    const ct = Buffer.from(parts[4]!, 'base64url');
    ct[0] = ct[0]! ^ 0xff;
    parts[4] = ct.toString('base64url');
    expect(() => decryptSecret(parts.join('.'), MASTER, PURPOSE)).toThrow(SecretDecryptError);
    expect(() => decryptSecret('v1.only.three', MASTER, PURPOSE)).toThrow(SecretDecryptError);
    expect(() => decryptSecret('v9.a.b.c.d', MASTER, PURPOSE)).toThrow(SecretDecryptError);
  });

  it('needs a master key of 32+ characters', () => {
    expect(() => encryptSecret(KEY, 'short', PURPOSE)).toThrow(/32/);
  });

  it('hints only the last 4 characters', () => {
    expect(secretHint(KEY)).toBe('…cdef');
    expect(secretHint('short')).toBe('…');
  });
});

describe('resolveAiSettings', () => {
  it('defaults to OpenRouter and is not configured without a key', () => {
    const r = resolveAiSettings(null, MASTER);
    expect(r).toMatchObject({ provider: 'openrouter', model: 'openai/gpt-4.1-mini', apiKey: null, configured: false });
    expect(r.problem).toMatch(/No API key/);
  });

  it('decrypts a stored key', () => {
    const r = resolveAiSettings({ value: { provider: 'openrouter', model: 'anthropic/claude-x' }, secret: encryptAiKey(KEY, MASTER) }, MASTER);
    expect(r).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-x', apiKey: KEY, configured: true, problem: null });
  });

  it('reports a key that a changed master key can no longer open', () => {
    const r = resolveAiSettings({ value: { provider: 'openai', model: 'gpt-4.1-mini' }, secret: encryptAiKey(KEY, MASTER) }, `${MASTER}-rotated`);
    expect(r.configured).toBe(false);
    expect(r.apiKey).toBeNull();
    expect(r.problem).toMatch(/can no longer be decrypted/);
  });

  it('treats Ollama as configured without a key', () => {
    expect(resolveAiSettings({ value: { provider: 'ollama', model: 'llama3.1:8b' }, secret: null }, MASTER)).toMatchObject({ configured: true, apiKey: null });
  });
});
