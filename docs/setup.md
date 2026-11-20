# Setup guide

This guide gets Bai-Tanaw running on your computer, step by step. No prior experience with Docker or Node is needed:
every command says what it does and what you should see.

> **Read this first.** Bai-Tanaw runs real security tools against real websites. Only scan applications the team has
> **written permission** to test, and only use test accounts. The list of hosts Bai-Tanaw may ever contact is
> `ASSESSMENT_ALLOWED_HOSTS` in your `.env` file; anything not on it is blocked.

**On this page**

1. [Install the tools](#1-install-the-tools)
2. [Get the code](#2-get-the-code)
3. [Path A: just run it (Docker)](#3-path-a-just-run-it-docker): best for trying it out and for the demo
4. [Path B: develop (live reload)](#4-path-b-develop-live-reload): for changing the code
5. [After you sign in](#5-after-you-sign-in)
6. [Stopping, starting and resetting](#6-stopping-starting-and-resetting)
7. [When something goes wrong](#7-when-something-goes-wrong)
8. [Reference: every setting in `.env`](#8-reference-every-setting-in-env)
9. [For contributors: checks and tests](#9-for-contributors-checks-and-tests)

---

## 1. Install the tools

You need three programs. Install them once.

| Program | Get it from | Notes |
|---|---|---|
| **Git** | <https://git-scm.com/downloads> | Downloads the code. |
| **Node.js 22 or newer** | <https://nodejs.org> (pick "LTS") | Runs the setup scripts and, in Path B, the apps. npm comes with it. |
| **Docker Desktop** | <https://www.docker.com/products/docker-desktop> | Runs the database and the scanners. **Open it after installing** and wait until it says "Engine running". |

Check that they work. Open **PowerShell** (Windows) or **Terminal** (macOS/Linux) and run:

```bash
git --version
```

```bash
node --version
```

```bash
docker --version
```

Each should print a version number. Node must be `v22` or higher. If a command is "not recognized", close the
terminal, open a new one, and try again (new installs only show up in new terminals).

> **Windows tip:** use PowerShell for the commands in this guide. Git Bash works too, except `docker compose` can fail
> there (see [When something goes wrong](#7-when-something-goes-wrong)).

## 2. Get the code

```bash
git clone https://github.com/Zero0blanK/bai-tanaw.git
```

```bash
cd bai-tanaw
```

This downloads the code into a new `bai-tanaw` folder. Every later command runs **inside that folder**.

Now create your settings file:

```bash
npm run env:init
```

**What it does:** creates `.env` (your private settings file) from `.env.example`, and fills in random passwords and
secret keys for you. It never prints them.
**You should see:** `Created .env from .env.example.` and `Generated new values for: …`.

> `.env` is private. It is ignored by git and must never be shared, committed, or pasted into chat or screenshots.

## 3. Path A: just run it (Docker)

Docker runs everything for you: the database, the job queue, the scanners, the API and the website. Use this path if
you only want to use Bai-Tanaw.

**Step 1. Make sure Docker Desktop is running** (its window says "Engine running").

**Step 2. Build and start everything**

```bash
npm run demo:up
```

The first run downloads and builds everything and can take **5 to 15 minutes** (the ZAP scanner alone is over 1 GB).
Later runs take seconds.
**You should see:** lines ending in `Started` or `Healthy`.

**Step 3. Create the first admin account**

```bash
npm run demo:seed
```

**You should see:** `Created first admin` (or `Admin already exists`, which is also fine).

**Step 4. Find your sign-in details**

Open the `.env` file in any text editor and look for these two lines:

```
SEED_ADMIN_EMAIL=admin@tanaw.local
SEED_ADMIN_PASSWORD=...
```

That email and password are your first login.

**Step 5. Open the app**

Go to <http://localhost:3000> and sign in. Then continue with [After you sign in](#5-after-you-sign-in).

**Check it is all running** (optional):

```bash
docker compose --profile app ps
```

Six services should be listed (`api`, `web`, `worker`, `postgres`, `redis`, `zap`). The worker has no health check;
the others should say `healthy` after a minute.

## 4. Path B: develop (live reload)

Use this path if you will change the code. The database and scanners still run in Docker, but the API, worker and
website run directly on your computer, and reload when you save a file.

**Step 1. Install the project's packages** (once, and again after pulling changes that touch `package.json`)

```bash
npm install
```

**Step 2. Start the database, queue and ZAP scanner in Docker**

```bash
docker compose up -d postgres redis zap
```

**Step 3. Create the database tables**

```bash
npm run db:deploy
```

**You should see:** `All migrations have been successfully applied.`

**Step 4. Create the first admin account**

```bash
npm run seed
```

**Step 5. Start the three apps**, each in **its own terminal window**, all inside the `bai-tanaw` folder:

```bash
npm run dev:api
```

```bash
npm run dev:worker
```

```bash
npm run dev:web
```

| App | Address | Ready when you see |
|---|---|---|
| API | <http://localhost:4000/api/health> | `API listening` |
| Worker | (no address; it runs jobs in the background) | `Worker ready` |
| Website | <http://localhost:3000> | `Ready in …` |

Sign in with the email and password from `.env` (see Path A, step 4).

> **Don't run both paths at once.** Path A's containers already use ports 3000 and 4000. Stop them first with
> `npm run demo:down`.

> **Nmap in Path B:** the worker on your computer needs Nmap installed (<https://nmap.org/download>) to run Nmap
> scans. Everything else works without it. The Docker worker in Path A already has Nmap.

## 5. After you sign in

Do these once, in this order:

1. **Change the admin password.** Click your name (top right) → **Account and password**.
2. **Add the AI key** (optional but recommended). Go to **Settings**, keep the provider on **OpenRouter**, paste the
   team's API key, click **Save**, then **Test connection**. The key is encrypted and never shown again. Without a key,
   everything works except the AI suggestions.
3. **Create accounts for teammates.** Go to **Users & roles** → **New user**. Pick **Assessor** for people who run
   tests, **Viewer** for read-only access.
4. **Register the target.** Go to **Targets** → **Register target**. The host must be on `ASSESSMENT_ALLOWED_HOSTS`.
   Write who approved the testing in **Authorization note**.
5. **Run an assessment.** Open the target and click **Run full assessment**. Findings appear in **Findings** by
   themselves; you then confirm, reject or mark each one as a false positive.

To scan Bayaw Jobs running on your own computer, see [demo.md](demo.md) (it explains `host.docker.internal`).

## 6. Stopping, starting and resetting

| I want to… | Run |
|---|---|
| Stop everything (Path A), keeping all data | `npm run demo:down` |
| Start it again | `npm run demo:up` |
| See what the API and worker are doing | `npm run demo:logs` (press `Ctrl+C` to stop watching) |
| Stop the Path B apps | Press `Ctrl+C` in each of the three terminals |
| Stop the Path B database and scanners | `docker compose down` |
| Get the latest code | `git pull`, then `npm install`, then `npm run demo:up` (Path A) or `npm run db:deploy` (Path B) |
| **Delete all data** and start fresh | `docker compose --profile app down -v` (**this erases every target, finding and account**), then `npm run demo:up` and `npm run demo:seed` |

## 7. When something goes wrong

| What you see | What to do |
|---|---|
| `docker: command not found` or `Cannot connect to the Docker daemon` | Docker Desktop isn't installed or isn't running. Open it and wait for "Engine running". |
| `error getting credentials … docker-credential-desktop` | You're in Git Bash. Run the command in PowerShell instead. |
| `port is already allocated` / `EADDRINUSE` | Another program uses that port (often an earlier run). Stop it, or run `npm run demo:down` and try again. To move the website to another port, set `WEB_PORT=3100` and `CORS_ORIGIN=http://localhost:3100` in `.env`. |
| `Invalid environment configuration` when starting | A setting in `.env` is missing or wrong; the message names it. Run `npm run env:init` again, or compare with `.env.example`. |
| The sign-in page keeps reloading, or "CORS" errors in the browser | `CORS_ORIGIN` in `.env` must be exactly the address in your browser, including the port. |
| `Invalid email or password` with the seeded admin | Copy the password from `.env` again (no spaces). If you changed it on the Account page, use the new one. |
| `Too many failed logins` | Wait 15 minutes; 5 wrong passwords lock the account for safety. |
| `This host is not on the assessment allowlist` | The target's host isn't in `ASSESSMENT_ALLOWED_HOSTS`. Add it **only if** it's approved, then restart (`npm run demo:up`). |
| `Request is outside the authorized scope` | A scope rule on the target blocks it; the message says which. Check the target's scope rules and test window. |
| Scans stay **Queued** | The worker isn't running. Path A: `npm run demo:up`. Path B: start `npm run dev:worker`. |
| AI buttons say the AI isn't set up (`503`) | Add the key in **Settings**. If it was there before, the encryption key in `.env` changed; paste the AI key again. |
| AI says daily limit reached (`429`) | Each user has `AI_DAILY_LIMIT` AI calls per day; it resets at midnight Philippine time. |
| Tests fail with `Can't reach database server` | Start the database (`docker compose up -d postgres`). If it is running, restart it: `docker compose restart postgres`. |
| Anything else | Run `npm run demo:logs` (Path A) or look at the three terminals (Path B): the error is usually spelled out there. |

## 8. Reference: every setting in `.env`

You normally don't need to change anything here: `npm run env:init` fills in the secrets. **Secret** values must never
appear in git, logs, screenshots or chat. Empty values count as "not set".

| Setting | Used by | Required | Example | What it is |
|---|---|---|---|---|
| `NODE_ENV` | all | no | `development` | `production` turns on strict checks. The Docker containers always use `production`. |
| `APP_NAME` | api | no | `Bai-Tanaw` | Shown in the health check. |
| `WEB_URL` | api | no | `http://localhost:3000` | Address of the website. |
| `API_URL` | acceptance script | no | `http://localhost:4000` | Address of the API. |
| `PORT` | api | no | `4000` | API port in Path B. |
| `WEB_PORT` / `API_PORT` | Docker | no | `3000` / `4000` | Ports on your computer in Path A. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Docker | yes | `tanaw` / **secret** / `tanaw` | Database login for the Postgres container. |
| `DATABASE_URL` | api, worker | **yes** | `postgresql://tanaw:…@127.0.0.1:5432/tanaw` | The main database (**secret**: contains the password). Use `127.0.0.1`, not `localhost`. |
| `TEST_DATABASE_URL` | tests | for tests | `postgresql://…@127.0.0.1:5432/tanaw_test` | A separate database the tests **erase**. Its name must contain `test`. |
| `REDIS_URL` | api, worker | no | `redis://127.0.0.1:6379` | The job queue. |
| `WORKER_CONCURRENCY` | worker | no | `2` | Jobs run at the same time (ZAP always runs one at a time). |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | api | **yes** | random, 32+ characters | Sign the login tokens (**secret**). Different from each other. |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | api | no | `15m` / `7d` | How long a login lasts. |
| `BCRYPT_ROUNDS` | api | no | `12` | How hard passwords are to crack if stolen (10 or more in production). |
| `CORS_ORIGIN` | api | no | `http://localhost:3000` | Website address(es) allowed to call the API, comma-separated, exact. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | seed | for the seed | `admin@tanaw.local` / **secret** / `Bai-Tanaw Admin` | The first admin. Password: 12+ characters with upper and lower case, a digit and a symbol. |
| `ASSESSMENT_ALLOWED_HOSTS` | api, worker | **effectively yes** | `bayawjobs.riomar.dev,localhost` | The only hosts Bai-Tanaw may ever contact. Empty means everything is blocked. |
| `NMAP_BIN` | worker | no | `nmap` | Where Nmap is installed. |
| `NMAP_DEFAULT_PORTS` | api, worker | no | `80,443` | Ports Nmap checks when none are given. |
| `TOOL_TIMEOUT_MS` | worker | no | `900000` | Longest a scan may run (15 minutes). |
| `ZAP_API_URL` / `ZAP_API_KEY` | worker | for ZAP | `http://127.0.0.1:8090` / **secret** | How the worker talks to the ZAP scanner. |
| `ZAP_ACTIVE_SCAN_ENABLED` | worker | no | `false` | Attacking scans. **Keep `false`** unless the instructor approves in writing. |
| `ZAP_SPIDER_MAX_MINUTES` | worker | no | `5` | Longest the ZAP spider crawls. |
| `SETTINGS_ENCRYPTION_KEY` | api, worker | **yes** | random, 32+ characters | Encrypts the AI key saved in Settings (**secret**). If it changes, paste the AI key again. |
| `OLLAMA_URL` | worker | for Ollama | `http://localhost:11434` | Only if Settings uses a local Ollama model. |
| `AI_DAILY_LIMIT` | api, worker | no | `20` | AI calls per user per day. |
| `AI_MAX_INPUT_CHARS` | worker | no | `12000` | Most scan output sent to the AI at once. |
| `STORAGE_DRIVER` / `STORAGE_LOCAL_DIR` | api, worker | no | `local` / `./storage` | Where raw reports and evidence files are kept. |
| `MAX_IMPORT_SIZE_MB` | api | no | `5` | Largest report or evidence file you can upload. |
| `NEXT_PUBLIC_API_URL` | website (at build time) | no | `http://localhost:4000/api` | Where the browser finds the API. |

The AI provider, model and key are **not** in `.env`: an admin sets them on the **Settings** page.

## 9. For contributors: checks and tests

Run these before every commit:

```bash
npm run type-check
```

```bash
npm run lint
```

```bash
npm test
```

`npm test` needs the database running (`docker compose up -d postgres`) and `TEST_DATABASE_URL` in `.env`.

To check the whole running app end to end (Path A must be running):

```powershell
$env:ACCEPTANCE_TARGET_URL='http://host.docker.internal:4000'; npm run acceptance
```

It creates two "Acceptance …" targets each run; see [acceptance.md](acceptance.md).

**Changing the database schema** (`apps/api/prisma/schema.prisma`): run
`npm run db:migrate -w @tanaw/api -- --name <what-changed>`, then `npm run docs:schema -w @tanaw/api` to update
[schema.md](schema.md). A test fails if you forget.

For how the parts fit together, see [architecture.md](architecture.md).
