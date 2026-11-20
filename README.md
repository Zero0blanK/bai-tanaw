# Tanaw

**Tanaw** (Filipino: "to view, to watch over") is an AI-assisted security assessment and vulnerability analysis platform
built for the CS24 final project. It assesses an **authorized** web application (Bayaw Jobs), runs and imports security
tool results, uses AI to explain results and suggest fixes, and keeps a human assessor in charge of what counts as a
confirmed vulnerability.

> Status: backend and web UI complete (Phases 1-7). Next: docs and the acceptance suite (Phase 8). The full build plan, rules, architecture and current status are in [AGENT.md](AGENT.md).

## Quick start (infrastructure)

```bash
cp .env.example .env
docker compose up -d postgres redis zap
```

## Run the apps in development (Node 22+)

```bash
npm install
npm run db:deploy    # apply migrations to DATABASE_URL
npm run seed         # first admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run dev:api      # http://localhost:4000/api/health
npm run dev:worker   # needs Redis from the step above
npm run dev:web      # http://localhost:3000
```

Checks before every commit: `npm run type-check && npm run lint && npm test`.
Everything in Docker: `docker compose --profile app up -d --build`.

## Layout

| Path | What lives there |
|---|---|
| `apps/api` | REST API (Express 5, TypeScript, Prisma, PostgreSQL) |
| `apps/worker` | Background jobs: Nmap, ZAP, HTTP/DNS/OpenAPI checks, AI analysis (BullMQ) |
| `apps/web` | Assessor UI (Next.js) |
| `packages/shared` | Zod schemas, enums and types shared by all apps |
| `infra` | Dockerfiles and tool configs |
| `docs` | Setup, architecture, schema, tasks, ADRs |
| `samples/reports` | Small Nmap/ZAP reports for tests |
