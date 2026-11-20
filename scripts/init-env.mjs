// npm run env:init: prepares the root .env for the Docker demo.
//  - creates .env from .env.example if it doesn't exist
//  - replaces the example secrets (values starting with "change-me") of JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
//    ZAP_API_KEY and SETTINGS_ENCRYPTION_KEY with random ones, and appends any of them that are missing
//  - on a brand-new .env only, also generates SEED_ADMIN_PASSWORD (read it from .env to sign in the first time).
//    An existing .env keeps its admin password, because the admin account may already exist with it.
// Values are never printed. Run it again any time; secrets that are already random stay as they are.
// Rotating the JWT secrets signs everyone out; a new ZAP key needs `docker compose up -d zap` to apply.
// SETTINGS_ENCRYPTION_KEY is only ever generated, never rotated: a new one would make the stored AI key unreadable.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

export const SECRET_KEYS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'ZAP_API_KEY', 'SETTINGS_ENCRYPTION_KEY'];

const randomSecret = () => randomBytes(48).toString('base64url');
// The fixed prefix guarantees the upper/lower/digit/symbol mix the password policy asks for.
const randomPassword = () => `Tn7-${randomBytes(18).toString('base64url')}`;

/** Returns the new file text and the keys that were replaced. */
export function fillSecrets(text, { includeSeedPassword = false } = {}) {
  const keys = includeSeedPassword ? [...SECRET_KEYS, 'SEED_ADMIN_PASSWORD'] : SECRET_KEYS;
  const replaced = [];
  const seen = new Set();
  let out = text.replace(/^([A-Z0-9_]+)=(.*)$/gm, (line, key, value) => {
    seen.add(key);
    if (!keys.includes(key)) return line;
    const v = value.trim();
    if (v !== '' && !v.startsWith('change-me')) return line;
    replaced.push(key);
    return `${key}=${key === 'SEED_ADMIN_PASSWORD' ? randomPassword() : randomSecret()}`;
  });
  const missing = SECRET_KEYS.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    if (!out.endsWith('\n')) out += '\n';
    out += `\n# Added by npm run env:init\n${missing.map((key) => `${key}=${randomSecret()}`).join('\n')}\n`;
    replaced.push(...missing);
  }
  return { text: out, replaced };
}

const say = (line) => process.stdout.write(`${line}
`);

function main() {
  let created = false;
  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    created = true;
  }
  const { text, replaced } = fillSecrets(readFileSync(envPath, 'utf8'), { includeSeedPassword: created });
  if (replaced.length > 0) writeFileSync(envPath, text);

  say(created ? 'Created .env from .env.example.' : '.env already exists.');
  say(replaced.length > 0 ? `Generated new values for: ${replaced.join(', ')}.` : 'Secrets were already set; nothing changed.');
  if (replaced.includes('SEED_ADMIN_PASSWORD')) say('The first admin password is in .env (SEED_ADMIN_PASSWORD).');
  const rest = readFileSync(envPath, 'utf8');
  if (/^SEED_ADMIN_PASSWORD=change-me/m.test(rest)) {
    say('Note: SEED_ADMIN_PASSWORD is still the example value. If the admin does not exist yet, set a real one in .env');
    say('before seeding (production refuses the example). Otherwise change the password on the Account page.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
