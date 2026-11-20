# 0002: Deploy Bai-Tanaw as a local-only Docker demo

- **Status:** accepted
- **Date:** 2026-11-20

## Context

Phase 9 needed a host for the Docker Compose stack. The options were a VPS, a school server, or the
presenting laptop. Things that mattered:

- Bai-Tanaw holds evidence about a real application's weaknesses and can launch scans. A public deployment is itself an
  attack surface that would need hardening, monitoring and patching for the life of the project.
- The only approved targets are the team's own Bayaw Jobs environments, and the demo runs against the local copy
  (`wrangler dev`) until the instructor approves scanning staging or production (§16.2).
- The demo is presented live from one machine. No one outside the team needs to sign in.
- There's no budget or domain for a server, and a school server would need IT approval for Nmap and ZAP traffic.

## Decision

Run the full stack (postgres, redis, zap, api, worker, web) with `docker compose --profile app` on the presenting
laptop. Concretely:

- Every published port is bound to `127.0.0.1`; nothing listens on the network.
- The api and worker containers always run with `NODE_ENV=production`, so the API refuses example secrets.
  `npm run env:init` generates them into `.env` without printing them.
- No TLS proxy. The browser only talks to `localhost`, which is a secure context, so the `Secure` refresh cookie works
  and HTTPS would add a local CA without protecting anything.
- Containers reach a target on the same laptop through `host.docker.internal`, which must be on
  `ASSESSMENT_ALLOWED_HOSTS`. It goes through the same scope checks as every other host.
- Admins change their password on the Account page (`POST /api/auth/password`), so the seeded password doesn't stay.

The steps are in [demo.md](../demo.md).

## Consequences

- **Good:** no public attack surface, no hosting cost, the same images and production settings as a server would use,
  and the demo doesn't depend on venue Wi-Fi (except the AI calls and pulling images the first time).
- **Bad:** there's no shared URL for graders or teammates; the "Functional System" deliverable is the repo, the
  runbook and the live demo. Data lives on one laptop, so back up the database and `storage/` before the demo
  (commands in demo.md).
- `host.docker.internal` reaches any service on the laptop, so allowlisting it is wider than a single app. Scope rules
  on the target (port range, URL prefixes) narrow it, and the target's own host check still applies.
- Moving to a server later needs: a TLS reverse proxy in front of web and api, ports no longer bound to loopback only
  for the proxy, ZAP left unpublished, `WEB_URL` / `CORS_ORIGIN` / `NEXT_PUBLIC_API_URL` set to the real origins, and
  backups. The compose file and images don't otherwise change.
