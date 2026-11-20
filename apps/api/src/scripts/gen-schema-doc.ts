import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchemaDoc, DOC_PATH } from './schemaDoc.js';

writeFileSync(DOC_PATH, buildSchemaDoc());
process.stdout.write(`Wrote ${fileURLToPath(DOC_PATH)}\n`);
