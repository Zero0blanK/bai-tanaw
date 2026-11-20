# @tanaw/api

REST API: auth, targets and scope, scans (queues jobs), imports, findings, verification, evidence, dashboard and report data.
Express 5 + TypeScript + Prisma (PostgreSQL) + Zod + BullMQ producer. Port 4000, routes under `/api`, docs at `/api/docs`.

Layering (strict): `routes → middlewares → controllers → services → repositories → Prisma`. See [docs/architecture.md](../../docs/architecture.md).
