# Tanaw

**Tanaw** (Filipino: "to view, to watch over") is an AI-assisted security assessment and vulnerability analysis platform
built for the CS24 final project. It assesses an **authorized** web application (Bayaw Jobs), runs and imports security
tool results, uses AI to explain results and suggest fixes, and keeps a human assessor in charge of what counts as a
confirmed vulnerability.

> Status: scaffold only. The full build plan, rules and architecture are in [AGENT.md](AGENT.md).

## Quick start (infrastructure)

```bash
cp .env.example .env
docker compose up -d postgres redis zap
```

The apps (`apps/api`, `apps/worker`, `apps/web`) are built by following [AGENT.md](AGENT.md).

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
