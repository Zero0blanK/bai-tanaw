# Local demo runbook

Tanaw is deployed **local-only**: the whole stack runs in Docker on the presenting laptop and nothing is reachable
from the network ([ADR 0002](adr/0002-local-only-deployment.md)). This page takes a clean machine to a working demo
and walks the assessment flow from AGENT.md §3 against the local Bayaw Jobs.

## 1. One-time setup

Needs Docker Desktop, Node 22+ and git. Bayaw Jobs needs its own setup (`npm install`, `.dev.vars`) in its repo.

```bash
git clone <repo-url> tanaw
cd tanaw
npm install
npm run env:init
```

`env:init` creates `.env` from `.env.example` and replaces the example secrets with random ones (JWT secrets, ZAP
API key, the settings encryption key and, on a new `.env`, the first admin's password). It never prints them. The AI
provider key does **not** go in `.env`: you paste it into the app in step 2. Then open `.env` and check:

| Variable | For the demo |
|---|---|
| `ASSESSMENT_ALLOWED_HOSTS` | Must contain `host.docker.internal` (the example already does) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | The first admin. Read the password from `.env` for the first sign-in |
| `WEB_PORT`, `CORS_ORIGIN` | Only if port 3000 is taken: e.g. `WEB_PORT=3100` and `CORS_ORIGIN=http://localhost:3100` |

## 2. Start Tanaw

```bash
npm run demo:up
```

```bash
npm run demo:seed
```

`demo:up` builds and starts postgres, redis, zap, api, worker and web (`docker compose --profile app up -d --build`).
The API applies migrations on start. `demo:seed` creates the first admin (it does nothing if one exists). The first
build takes several minutes; the ZAP image alone is over 1 GB.

Open <http://localhost:3000>, sign in as the admin, and go to **Account** to change the password. Under **Users**,
create one ASSESSOR for the assessment and, if you want to show read-only access, one VIEWER.

Then open **Settings**: keep the provider on OpenRouter, pick a model that supports structured outputs (default
`openai/gpt-4.1-mini`), paste the team's OpenRouter key, **Save**, then **Test connection**. The key is encrypted on the
server (AES-256-GCM, key derived with scrypt from `SETTINGS_ENCRYPTION_KEY`), only its last 4 characters are ever shown,
and the audit log records that it changed but not the key. Without a key the AI buttons answer `503`, which is also a
valid demo point (show it, then add the key).

Check it is healthy:

```bash
docker compose --profile app ps
```

All services should be `running`; api, postgres, redis, web and zap also report `healthy` (ZAP takes about a minute).

### What runs in production mode

The api and worker containers always run with `NODE_ENV=production`, whatever `.env` says: the API refuses example
JWT secrets, the refresh cookie gets the `Secure` flag (browsers accept it on `http://localhost`), and logs are JSON.
Every published port is bound to `127.0.0.1`: web 3000, API 4000, Postgres 5432, Redis 6379, ZAP 8090. Other machines
on the network can't reach any of them.

### Why no HTTPS

The demo never leaves the laptop: the browser talks to `localhost`, which browsers treat as a secure context. A TLS
proxy would add a local CA to install and nothing to show. The HTTP check still grades Bayaw Jobs' own HTTPS setup
against its real hosts once the instructor approves scanning them (AGENT.md §16.2).

## 3. Start the target

In the Bayaw Jobs repo:

```bash
npx wrangler dev
```

The API listens on `http://localhost:8787`. Containers can't use `localhost` (inside a container that's the container
itself), so **register the target as `http://host.docker.internal:8787`**. Docker Desktop forwards that name to this
laptop, including to services that only listen on 127.0.0.1. No extra wrangler flags are needed.

## 4. Demo flow

Sign in as the assessor. Each step names the page and what to point out.

| # | Phase (AGENT.md §3) | Do | Point out |
|---|---|---|---|
| 1 | Define scope | **Targets → New**: name "Bayaw Jobs (local)", base URL `http://host.docker.internal:8787`, authorization note, test window covering today | `https://example.com` is refused with 403: the allowlist |
| 2 | | Scope rules: in-scope `PORT_RANGE 8787`; out-of-scope `URL http://host.docker.internal:8787/api/admin` | Scope tester: `/api/admin/users` → blocked, `/api/jobs` → allowed |
| 3 | Reconnaissance + scanning | Target page → **Run full assessment** | One click runs HTTP check, DNS, OpenAPI, Nmap (target port included) and ZAP within scope; the track fills step by step. Out-of-scope tools are skipped, not forced |
| 4 | Security assessment | Watch **Findings** fill up | Each finished scan becomes "Tool rule" findings (missing headers, cookie flags, CORS, open ports, ZAP alerts), never duplicated on a re-run |
| 5 | AI analysis | Nothing to click | The AI reads each finished scan on its own and adds what the rules missed, marked "AI suggestion, not verified" and citing its evidence |
| 6 | | Scan detail | The AI status and token use per scan; **Re-run AI** exists for scans that finished before a key was saved |
| 7 | Verification | Finding → add evidence (HTTP exchange or screenshot) → **Confirm** with a CVSS vector; **Reject** one with notes | Confirm needs severity, CVSS and evidence; the history keeps every decision |
| 8 | Risk assessment | Finding → **Suggest fix** → accept the draft | The draft is never applied on its own; the assessor accepts or edits it |
| 9 | Report | **Dashboard**, then **Report** → Print to PDF | Only CONFIRMED and FIXED findings, with evidence and remediation |
| 10 | | Sign in as admin → **Audit log** | Scope blocks, scans, AI requests (automatic ones marked `auto`), verifications, report export |

Have a manual finding ready for the categories the tools can't judge (authentication and access control, e.g. a
WSTG-ATHZ test done by hand with a test account). Use **Findings → New** and attach the HTTP exchange as evidence.

## 5. Check the stack (before presenting)

With the stack up, the acceptance suite drives every feature through the API against Tanaw's own API as the target:

```bash
ACCEPTANCE_TARGET_URL=http://host.docker.internal:4000 npm run acceptance
```

On PowerShell set the variable first (`$env:ACCEPTANCE_TARGET_URL='http://host.docker.internal:4000'`). It signs in
with `SEED_ADMIN_*` from `.env`, so it only works while the admin still has that password. It leaves two targets named
"Acceptance …" behind; use a fresh database (below) if they'd clutter the demo.

## 6. Day to day

| Task | Command |
|---|---|
| Follow api and worker logs | `npm run demo:logs` |
| Stop (keeps data) | `npm run demo:down` |
| Rebuild after pulling changes | `npm run demo:up` |
| Back up the database | `docker compose exec postgres pg_dump -U tanaw tanaw > backup.sql` |
| Back up evidence and raw reports | `docker compose cp api:/app/storage ./storage-backup` |
| Start over with an empty database | `docker compose --profile app down -v` (**deletes all data and evidence**), then `demo:up` and `demo:seed` |

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `error getting credentials … docker-credential-desktop` | Git Bash doesn't have Docker's helpers on `PATH`. Run the command from PowerShell, or add `C:\Program Files\Docker\Docker\resources\bin` to `PATH`. |
| API container restarts with `production needs a random secret` | Run `npm run env:init`, then `npm run demo:up`. |
| `demo:seed` says it refuses the example admin password | Set a real `SEED_ADMIN_PASSWORD` in `.env` (12+ chars, upper, lower, digit, symbol) and run it again. |
| Port already in use | Another app holds 3000/4000/5432/6379/8090. Stop it, or change `WEB_PORT` (and `CORS_ORIGIN`) / `API_PORT` (and `NEXT_PUBLIC_API_URL`, then rebuild). |
| Scans of `localhost:8787` fail to connect | Register the target as `http://host.docker.internal:8787`, not `localhost`. |
| `This host is not on the assessment allowlist` for `host.docker.internal` | Add it to `ASSESSMENT_ALLOWED_HOSTS` in `.env`, then `docker compose up -d api worker`. |
| ZAP scan fails right after start | ZAP needs about a minute; wait for `healthy` in `docker compose ps`. A changed `ZAP_API_KEY` needs `docker compose up -d zap worker`. |
| AI buttons answer `503` after a `.env` change | `SETTINGS_ENCRYPTION_KEY` changed, so the stored key can't be decrypted. Paste it again in **Settings**. |
| Sign-in works but every page bounces to login | `CORS_ORIGIN` must match the web address exactly, port included. |
