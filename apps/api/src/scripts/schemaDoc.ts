// Builds docs/schema.md from the Prisma schema, so the database docs can't drift from the code.
// Fields, types, defaults, relations and /// comments come from Prisma's DMMF; indexes from schema.prisma itself.
// Regenerate: npm run docs:schema --workspace @tanaw/api   (a test fails when the file is stale)

import { readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';

export const SCHEMA_PATH = new URL('../../prisma/schema.prisma', import.meta.url);
export const DOC_PATH = new URL('../../../../docs/schema.md', import.meta.url);

type Field = (typeof Prisma.dmmf.datamodel.models)[number]['fields'][number];

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function formatDefault(field: Field): string {
  if (field.isUpdatedAt) return 'auto (updated at)';
  const d = field.default as unknown;
  if (d === undefined) return '';
  if (typeof d === 'object' && d !== null && 'name' in d) return `${String((d as { name: string }).name)}()`;
  return `\`${String(d)}\``;
}

/** Native column type per field (e.g. @db.Uuid), read from the schema text. */
function nativeTypes(schema: string): Map<string, string> {
  const map = new Map<string, string>();
  let model = '';
  for (const line of schema.split('\n')) {
    const m = /^model\s+(\w+)/.exec(line);
    if (m?.[1]) model = m[1];
    if (/^}/.test(line)) model = '';
    const f = /^\s+(\w+)\s+\S+.*@db\.(\w+)/.exec(line);
    if (model && f?.[1] && f[2]) map.set(`${model}.${f[1]}`, f[2]);
  }
  return map;
}

/** @@index / @@unique lines per model. */
function indexes(schema: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  let model = '';
  for (const line of schema.split('\n')) {
    const m = /^model\s+(\w+)/.exec(line);
    if (m?.[1]) model = m[1];
    if (/^}/.test(line)) model = '';
    const idx = /^\s+@@(index|unique)\(\[([^\]]+)\]/.exec(line);
    if (model && idx?.[1] && idx[2]) map.set(model, [...(map.get(model) ?? []), `${idx[1]} (${idx[2].replace(/\s+/g, ' ')})`]);
  }
  return map;
}

export function buildSchemaDoc(): string {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const natives = nativeTypes(schema);
  const idx = indexes(schema);
  const { models, enums } = Prisma.dmmf.datamodel;
  const tableOf = new Map(models.map((m) => [m.name, m.dbName ?? m.name]));

  const out: string[] = [
    '# Database schema',
    '',
    '<!-- GENERATED from apps/api/prisma/schema.prisma by apps/api/src/scripts/schemaDoc.ts. Do not edit by hand. -->',
    '<!-- Regenerate: npm run docs:schema --workspace @tanaw/api -->',
    '',
    'PostgreSQL 16 through Prisma 6. Every id is a UUID. Columns that point at a user (`created_by`, `started_by`,',
    '`assessor_id`, `actor_id`) are nullable foreign keys with `ON DELETE SET NULL`, so deleting a user keeps the history.',
    'Shapes of `scan_results.data` are in `packages/shared/src/schemas/scanResults.ts`.',
    '',
    '## Tables',
    '',
    ...models.map((m) => `- [\`${m.dbName ?? m.name}\`](#${m.dbName ?? m.name})${m.documentation ? `: ${esc(m.documentation)}` : ''}`),
    '',
  ];

  for (const m of models) {
    const table = m.dbName ?? m.name;
    out.push(`### ${table}`, '');
    if (m.documentation) out.push(esc(m.documentation), '');
    out.push('| Column | Type | Null | Default | Key / notes |', '|---|---|---|---|---|');
    for (const f of m.fields.filter((x) => x.kind !== 'object')) {
      const native = natives.get(`${m.name}.${f.name}`);
      const type = f.kind === 'enum' ? `enum [${f.type}](#enum-${f.type.toLowerCase()})` : `${f.type}${native ? ` (${native})` : ''}`;
      const relation = m.fields.find((r) => r.kind === 'object' && r.relationFromFields?.includes(f.name));
      const notes = [
        f.isId ? 'PK' : '',
        f.isUnique ? 'unique' : '',
        relation ? `FK → \`${tableOf.get(relation.type) ?? relation.type}.${relation.relationToFields?.[0] ?? 'id'}\` (on delete ${String(relation.relationOnDelete ?? 'no action').toLowerCase()})` : '',
        f.documentation ? esc(f.documentation) : '',
      ].filter(Boolean);
      out.push(`| \`${f.name}\` | ${type}${f.isList ? '[]' : ''} | ${f.isRequired ? 'no' : 'yes'} | ${formatDefault(f)} | ${notes.join('; ')} |`);
    }
    const modelIdx = idx.get(m.name);
    if (modelIdx?.length) out.push('', `Indexes: ${modelIdx.map((i) => `\`${i}\``).join(', ')}.`);
    out.push('');
  }

  out.push('## Enums', '');
  for (const e of enums) {
    out.push(`### Enum ${e.name}`, '', e.values.map((v) => `\`${v.name}\``).join(' · '), '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
