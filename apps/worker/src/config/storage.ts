import { isAbsolute, resolve } from 'node:path';
import { LocalStorage } from '@tanaw/shared/node';
import { env } from './env.js';

// Same resolution as the API: a relative STORAGE_LOCAL_DIR is relative to the repo root.
const repoRoot = resolve(import.meta.dirname, '../../../..');
const baseDir = isAbsolute(env.STORAGE_LOCAL_DIR) ? env.STORAGE_LOCAL_DIR : resolve(repoRoot, env.STORAGE_LOCAL_DIR);

export const storage = new LocalStorage(baseDir);
