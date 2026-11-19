import { isAbsolute, resolve } from 'node:path';
import { LocalStorage } from '@tanaw/shared/node';
import { env } from './env.js';

// A relative STORAGE_LOCAL_DIR is resolved from the repo root, so the API and the worker share one folder in dev.
const repoRoot = resolve(import.meta.dirname, '../../../..');
const baseDir = isAbsolute(env.STORAGE_LOCAL_DIR) ? env.STORAGE_LOCAL_DIR : resolve(repoRoot, env.STORAGE_LOCAL_DIR);

export const storage = new LocalStorage(baseDir);
