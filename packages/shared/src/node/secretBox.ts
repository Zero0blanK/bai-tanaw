// Encryption for secrets that admins enter in the app (e.g. the AI provider's API key), so they never sit in
// .env or in the database as plain text.
//
//   key  = scrypt(SETTINGS_ENCRYPTION_KEY, random 16-byte salt, N=2^15, r=8, p=1) → 32 bytes
//   blob = AES-256-GCM(key, random 12-byte IV, plaintext, AAD = "tanaw:<purpose>:v1")
//   stored as "v1.<salt>.<iv>.<tag>.<ciphertext>" (base64url)
//
// GCM authenticates the data: a tampered blob, a blob copied to another purpose, or a wrong master key all fail
// to decrypt instead of returning garbage. scrypt makes guessing a weak master key expensive; env:init generates a
// random one anyway. A fresh salt and IV per write mean the same key never encrypts to the same blob twice.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

const VERSION = 'v1';
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretDecryptError extends Error {
  constructor(message = 'The stored secret cannot be decrypted (wrong SETTINGS_ENCRYPTION_KEY or tampered data)') {
    super(message);
    this.name = 'SecretDecryptError';
  }
}

// Deriving a key costs ~50-100 ms by design; cache per (master key, salt) so reading the same blob is cheap.
const keyCache = new Map<string, Buffer>();

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  const id = createHash('sha256').update(masterKey).update(salt).digest('hex');
  const cached = keyCache.get(id);
  if (cached) return cached;
  const key = scryptSync(masterKey, salt, KEY_BYTES, SCRYPT);
  if (keyCache.size >= 32) keyCache.clear();
  keyCache.set(id, key);
  return key;
}

function aad(purpose: string): Buffer {
  return Buffer.from(`tanaw:${purpose}:${VERSION}`, 'utf8');
}

function assertMasterKey(masterKey: string): void {
  if (masterKey.length < 32) throw new Error('SETTINGS_ENCRYPTION_KEY must be at least 32 characters');
}

/** Encrypts `plaintext` for one `purpose` (e.g. "settings.ai.api_key"). */
export function encryptSecret(plaintext: string, masterKey: string, purpose: string): string {
  assertMasterKey(masterKey);
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(masterKey, salt), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aad(purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, salt, iv, tag, ciphertext].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/** Decrypts a blob from encryptSecret. Throws SecretDecryptError if anything doesn't match. */
export function decryptSecret(blob: string, masterKey: string, purpose: string): string {
  assertMasterKey(masterKey);
  const parts = blob.split('.');
  if (parts.length !== 5 || parts[0] !== VERSION) throw new SecretDecryptError('Unknown secret format');
  const [salt, iv, tag, ciphertext] = parts.slice(1).map((p) => Buffer.from(p, 'base64url')) as [Buffer, Buffer, Buffer, Buffer];
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretDecryptError('Malformed secret');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(masterKey, salt), iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(aad(purpose));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new SecretDecryptError();
  }
}

/** A safe hint for the UI: the last 4 characters, e.g. "…a1b2". Never more. */
export function secretHint(plaintext: string): string {
  return plaintext.length >= 12 ? `…${plaintext.slice(-4)}` : '…';
}
