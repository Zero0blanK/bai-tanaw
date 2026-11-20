// Local-disk storage for raw tool output, uploaded reports and evidence.
// Keys are relative paths like "targets/<id>/scans/<scanId>.xml"; they never escape the base directory.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export interface StorageService {
  put(key: string, data: Uint8Array | string): Promise<string>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

export class LocalStorage implements StorageService {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
  }

  /** Resolves a key to a path inside the base directory, rejecting traversal and odd characters. */
  resolveKey(key: string): string {
    if (!KEY_RE.test(key) || key.split('/').some((part) => part === '..' || part === '.')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const full = resolve(this.base, key);
    const rel = relative(this.base, full);
    if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
      throw new Error(`Storage key escapes the storage directory: ${key}`);
    }
    return full;
  }

  async put(key: string, data: Uint8Array | string): Promise<string> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return key;
  }

  get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }
}

/** Storage keys used across the API and the worker. */
export const storageKeys = {
  scanRaw: (targetId: string, scanId: string, ext: 'xml' | 'json' | 'txt') => `targets/${targetId}/scans/${scanId}.${ext}`,
  evidence: (targetId: string, evidenceId: string, ext: string) => `targets/${targetId}/evidence/${evidenceId}.${ext}`,
};
