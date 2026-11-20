# Bai-Tanaw

**Bai-Tanaw** is an AI-assisted security assessment platform built for the CS24 (Cybersecurity) final project.
It tests one **authorized** web application (the team's job portal, Bayaw Jobs): it runs the security tools, turns their
output into findings, uses AI to explain them and suggest fixes, and leaves every final decision to a human assessor.
("Tanaw" is Filipino for "to view, to watch over".)

## What it does

- **Scope first.** Every request is checked against a server-side allowlist and the target's scope rules before it
  leaves, and checked again by the worker. Blocked attempts are written to the audit log.
- **One-click assessment.** **Run full assessment** runs the HTTP security check, DNS, OpenAPI discovery, Nmap and
  OWASP ZAP (spider and passive scan only) in one go, and shows progress step by step.
- **Findings appear by themselves.** Fixed rules turn scan results into findings, each with a suggested CVSS v3.1 score,
  a suggested fix and any CVE IDs the tools reported. Re-running doesn't create duplicates.
- **AI analysis, automatically.** The AI (OpenRouter, OpenAI or a local Ollama model) reads each finished scan and adds
  what the rules missed. Secrets are removed before anything is sent, and AI output is only ever a suggestion.
- **Humans decide.** Findings wait in a verification queue. An assessor confirms (with evidence and CVSS), rejects or
  marks each one as a false positive. Every decision is recorded.
- **Dashboard and report.** Live counts, a severity summary, and a printable report with confirmed and fixed findings
  only, including evidence, CVSS, CVEs and remediation.
- **Accounts and audit.** Admin, Assessor and Viewer roles, account lockout, and an audit log of every sign-in, scan,
  AI request, decision and export.

## Quick start

You need **Git**, **Node.js 22+** and **Docker Desktop** (running). Then, in PowerShell or a terminal:

```bash
git clone https://github.com/Zero0blanK/bai-tanaw.git
```

```bash
cd bai-tanaw
```

```bash
npm run env:init
```

```bash
npm run demo:up
```

```bash
npm run demo:seed
```

Open <http://localhost:3000> and sign in with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from the new `.env` file.
The first `demo:up` takes several minutes while Docker downloads and builds everything.

**New to this?** Follow the step-by-step [setup guide](docs/setup.md). It also covers the development setup with live
reload, first steps after signing in, and fixes for common problems.

## Documentation

| Read this | To |
|---|---|
| [docs/setup.md](docs/setup.md) | Install and run Bai-Tanaw, step by step |
| [docs/demo.md](docs/demo.md) | Run the live demo against a local copy of Bayaw Jobs |
| [docs/architecture.md](docs/architecture.md) | Understand how the parts fit together, including the AI safeguards |
| [docs/schema.md](docs/schema.md) | See every database table (generated from the Prisma schema) |
| [docs/acceptance.md](docs/acceptance.md) | See what is tested and how to run the end-to-end checks |
| [docs/tasks.md](docs/tasks.md) | Find the open work for each team role |
| [docs/adr/](docs/adr/) | Read why key decisions were made |

## Ground rules

These come from the instructor's ethics guidelines and are enforced in the code:

1. Scan only hosts the team has **written permission** to test.
2. No destructive testing: Nmap runs gently (`-T3`, service detection only); ZAP's active scan stays off.
3. Test accounts and synthetic data only.
4. Secrets and personal data never go to the AI.
5. Only a human assessor can confirm a vulnerability; the report contains confirmed and fixed findings only.

## Tech stack

| Part | Built with |
|---|---|
| Website | Next.js 15, React 19, Tailwind CSS 4 |
| API | Node.js 22, Express 5, TypeScript, Zod |
| Database | PostgreSQL 16 with Prisma |
| Background jobs | Redis and BullMQ (a separate worker runs the tools and the AI) |
| Security tools | Nmap, OWASP ZAP, built-in HTTP, DNS and OpenAPI checks |
| AI | OpenRouter / OpenAI structured outputs, or Ollama |
| Packaging | Docker Compose (everything bound to this computer only) |
| Tests | Vitest and Supertest, plus a live end-to-end acceptance script |

## Project layout

| Folder | What's inside |
|---|---|
| `apps/web` | The website assessors use |
| `apps/api` | The REST API and the database schema (`prisma/`) |
| `apps/worker` | Background jobs: the scanners, the finding rules and the AI calls |
| `packages/shared` | Code all apps share: scope checks, finding rules, CVSS scoring, validation schemas |
| `docs` | Guides and reference documentation |
| `scripts` | Setup and acceptance-test scripts |
| `samples/reports` | Small Nmap and ZAP reports used by the tests |

## Status

Complete and running as a local-only demo ([ADR 0002](docs/adr/0002-local-only-deployment.md)). Still open: testing
against Bayaw Jobs with the instructor's written approval, the OpenAPI docs page for Bai-Tanaw's own API, and the
written deliverables. See [docs/tasks.md](docs/tasks.md).
