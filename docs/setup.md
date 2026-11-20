# Setup

How to run Bai-Tanaw on your machine, with every setting explained. For how the parts fit together, see
[architecture.md](architecture.md).

> Bai-Tanaw scans real systems. Only add hosts you have **written permission** to test to `ASSESSMENT_ALLOWED_HOSTS`,
> and use test accounts and synthetic data only.

## 1. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 22 LTS or newer | API, worker and web |
| npm | 10+ (comes with Node) | Workspaces |
| Docker Desktop | recent | PostgreSQL, Redis, OWASP ZAP (and the full stack, if you want) |
| Git | any | |
| Nmap | optional | Only to run Nmap scans from a worker started with `npm run dev:worker`. The worker Docker image already has it. |

## 2. First run

```bash
git clone <repo-url> tanaw
cd tanaw
cp .env.example .env          # then edit .env (see section 3)
npm install                   # also generates the Prisma client
docker compose up -d postgres redis
npm run db:deploy             # apply migrations to DATABASE_URL
npm run seed                  # first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
```

Then start the three apps, each in its own terminal:

```bash
npm run dev:api      # http://localhost:4000/api/health
npm run dev:worker   # no port; logs "Worker ready"
npm run dev:web      # http://localhost:3000
```

Open <http://localhost:3000>, sign in as the seeded admin, and **change that password** on the Account page. For the
AI features, open **Settings**, choose the provider (OpenRouter by default), paste the API key and save. It is encrypted
before it is stored and never shown again; it does not go in `.env`.

To run OWASP ZAP scans, start its container too: `docker compose up -d zap` (a large image; first pull takes a while).

### Everything in Docker

```bash
npm run env:init     # random JWT secrets and ZAP key in .env (never printed)
npm run demo:up      # docker compose --profile app up -d --build
npm run demo:seed    # first admin
```

The API container applies migrations on start. The api and worker containers always run with `NODE_ENV=production`
(the API refuses example secrets) and every port is bound to 127.0.0.1. This is how the demo runs; the full runbook,
including reaching a target on the same laptop through `host.docker.internal`, is [demo.md](demo.md).

## 3. Environment variables

All apps read the single root `.env`. Empty values count as unset. Values marked **secret** must never appear in git,
logs, screenshots or chat.

| Variable | Used by | Required | Example | Meaning |
|---|---|---|---|---|
| `NODE_ENV` | all | no | `development` | `production` enables strict secret checks and `Secure` cookies |
| `APP_NAME` | api | no | `Bai-Tanaw` | Shown in the health check |
| `WEB_URL` | api | no | `http://localhost:3000` | Public URL of the web app |
| `API_URL` | docs only | no | `http://localhost:4000` | Public URL of the API |
| `PORT` | api | no | `4000` | API port |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | compose | yes (Docker) | `tanaw` / **secret** / `tanaw` | Credentials for the Postgres container |
| `DATABASE_URL` | api, worker | **yes** | `postgresql://tanaw:…@localhost:5432/tanaw` | Main database (**secret**: holds the password) |
| `TEST_DATABASE_URL` | tests | for DB tests | `postgresql://…/tanaw_test` | Database the tests **wipe**; its name must contain `test` |
| `REDIS_URL` | api, worker | no | `redis://localhost:6379` | BullMQ queue |
| `WORKER_CONCURRENCY` | worker | no | `2` | Jobs run at once (ZAP is always one at a time) |
| `JWT_ACCESS_SECRET` | api | **yes** | random 32+ chars | Signs access tokens (**secret**) |
| `JWT_REFRESH_SECRET` | api | **yes** | different random 32+ chars | Keys the refresh-token hash (**secret**) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | api | no | `15m` / `7d` | Token lifetimes (`s`, `m`, `h`, `d`) |
| `BCRYPT_ROUNDS` | api | no | `12` | Password hash cost (production needs ≥ 10) |
| `CORS_ORIGIN` | api | no | `http://localhost:3000` | Allowed web origin(s), comma-separated, exact match |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | seed | for the seed | `admin@tanaw.local` / **secret** | First admin. Password: 12+ chars with upper, lower, digit and symbol |
| `ASSESSMENT_ALLOWED_HOSTS` | api, worker | **effectively yes** | `bayawjobs.riomar.dev,localhost` | Hard allowlist. Empty = everything is blocked. Exact hostnames only |
| `NMAP_BIN` | worker | no | `nmap` | Nmap executable |
| `NMAP_DEFAULT_PORTS` | api, worker | no | `80,443` | Ports when a scan doesn't give any |
| `TOOL_TIMEOUT_MS` | worker | no | `900000` | Max run time for Nmap and ZAP |
| `ZAP_API_URL` | worker | no | `http://localhost:8090` | ZAP daemon API (in Docker: `http://zap:8090`) |
| `ZAP_API_KEY` | worker, compose | for ZAP | **secret** | ZAP API key, shared with the container |
| `ZAP_ACTIVE_SCAN_ENABLED` | worker | no | `false` | Attacking scans. **Keep `false`** unless the instructor approves in writing |
| `ZAP_SPIDER_MAX_MINUTES` | worker | no | `5` | Upper bound for one spider run |
| `SETTINGS_ENCRYPTION_KEY` | api, worker | **yes** | random 32+ chars (`npm run env:init`) | Master key that encrypts secrets saved in Settings (the AI API key). If it changes, re-enter the key in Settings (**secret**) |
| `OLLAMA_URL` | worker | for Ollama | `http://localhost:11434` | Where the worker reaches Ollama when Settings picks it |
| `AI_DAILY_LIMIT` | api | no | `20` | AI jobs per user per day (resets at midnight Philippine time) |
| `AI_MAX_INPUT_CHARS` | worker | no | `12000` | Cap on tool output sent in one prompt |
| `STORAGE_DRIVER` | none yet | no | `local` | Only local storage exists |
| `STORAGE_LOCAL_DIR` | api, worker | no | `./storage` | Raw reports and evidence; relative paths are from the repo root |
| `MAX_IMPORT_SIZE_MB` | api | no | `5` | Max size of an imported report or evidence file |
| `NEXT_PUBLIC_API_URL` | web (build time) | no | `http://localhost:4000/api` | Where the browser calls the API |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## 4. Checks and tests

```bash
npm run type-check
npm run lint
npm test               # unit + API tests; DB tests need TEST_DATABASE_URL and Postgres running
npm run acceptance     # end-to-end checks against a running stack (see acceptance.md)
```

After changing `apps/api/prisma/schema.prisma`: `npm run db:migrate -- --name <change>`, then
`npm run docs:schema --workspace @tanaw/api` to refresh [schema.md](schema.md) (a test fails if you forget).

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` on start | The message lists each bad variable. Compare with `.env.example`. |
| `This host is not on the assessment allowlist` | Add the host to `ASSESSMENT_ALLOWED_HOSTS`, but only if it's in the approved scope. |
| `Request is outside the authorized scope: …` | The reason says which rule blocked it: add or fix a scope rule on the target, or check the test window. |
| `Queue unavailable (is Redis running?)` / `503` on scans | `docker compose up -d redis`. |
| Scans stay `Queued` | The worker isn't running (`npm run dev:worker`) or can't reach Redis. |
| Nmap scan fails locally | Install Nmap or set `NMAP_BIN`; or run the worker in Docker. |
| ZAP scan fails | `docker compose up -d zap`, and `ZAP_API_KEY` must match in both places. |
| AI buttons answer `503` | No API key yet, or `SETTINGS_ENCRYPTION_KEY` changed since it was saved. An admin opens **Settings**, pastes the OpenRouter key and clicks **Test connection**. |
| AI buttons answer `429` | Daily cap reached (`AI_DAILY_LIMIT`); resets at midnight Philippine time. |
| Login page loops or CORS errors | `CORS_ORIGIN` must equal the web origin exactly, including the port. |
| `docker compose` fails on `docker-credential-desktop` (Git Bash) | Run it from PowerShell, or add `C:\Program Files\Docker\Docker
esourcesin` to `PATH`. |
| Port 3000 already in use | Run the web with `npx next dev --port 3100` (in `apps/web`) and add `http://localhost:3100` to `CORS_ORIGIN`. |
| `429` on login | Either 5 wrong passwords locked the account, or one IP made 20 attempts. Both clear after 15 minutes. |
| `next build` can't find an export from `@tanaw/shared` | Build from the root (`npm run build`), which rebuilds the shared package first. |
| Tests fail with `prisma migrate deploy failed` | Postgres isn't running, or `TEST_DATABASE_URL` is wrong. |
