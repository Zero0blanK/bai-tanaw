# 0001: Bai-Tanaw is a separate platform, not a module inside Bayaw Jobs

- **Status:** accepted
- **Date:** 2026-11-19

## Context

The first version of the assessment tool was built inside the target application, Bayaw Jobs, as an admin-only module.
Bayaw Jobs runs on Cloudflare Workers with D1, R2 and Cloudflare Queues. Building there showed several problems:

- **The tools can't run there.** Workers have no processes or raw sockets, so Nmap and OWASP ZAP had to run on someone's
  laptop through an optional "scanner agent" that uploaded results. DNS needed DNS-over-HTTPS.
- **The assessor and the target shared an identity system.** The tool's access depended on the target's auth, including
  shared demo accounts whose passwords are public and reset nightly. A tester with those accounts could reach the tool.
- **The boundary was blurred.** Testing an app from inside itself mixes the thing being assessed with the assessment
  record. A demo reset of the target could also touch the assessment trail (it had to avoid foreign keys to users).
- **D1 has no transactions,** so "verification log + status change" and "scan + results" couldn't be atomic.

## Decision

Build the assessment platform as its own system, **Bai-Tanaw**, with its own repository, database, users, roles and
deployment. Bayaw Jobs becomes only the target, reached over the network like any other authorized host.

Stack: Node 22 + TypeScript monorepo; Express 5 API; PostgreSQL 16 via Prisma; Redis + BullMQ for long jobs; a worker
container that carries Nmap and drives a ZAP daemon; Next.js web UI; Docker Compose to run it all. The proven logic from
the prototype (scope rules, tools, parsers, AI pipeline, verification) was ported and renamed.

## Consequences

- Nmap and ZAP run server-side in the worker; no scanner agent is needed.
- Bai-Tanaw has its own accounts (ADMIN / ASSESSOR / VIEWER) with lockout, rotating refresh tokens and an audit log; the
  target's demo accounts give no access to Bai-Tanaw.
- Real foreign keys and transactions: verification and scan results are atomic, and deleting a user keeps history.
- More to operate: Bai-Tanaw needs a host that can run Docker Compose (an open decision at the time), its own secrets and
  HTTPS. Bai-Tanaw must reach the target over the internet, so production scans depend on the instructor's written approval.
- The prototype in the Bayaw Jobs repo stays as reference until the team decides what to do with it.
