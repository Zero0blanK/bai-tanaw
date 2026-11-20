import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSchemaDoc, DOC_PATH } from './schemaDoc.js';

describe('docs/schema.md', () => {
  it('matches the Prisma schema (run `npm run docs:schema -w @tanaw/api` after schema changes)', () => {
    const onDisk = readFileSync(DOC_PATH, 'utf8').replace(/\r\n/g, '\n');
    expect(onDisk).toBe(buildSchemaDoc());
  });
});
