# Bai-Tanaw docs

| Doc | What's in it |
|---|---|
| [demo.md](demo.md) | **The demo**: start the Docker stack, start Bayaw Jobs, the step-by-step assessment flow, backups, troubleshooting |
| [setup.md](setup.md) | Run Bai-Tanaw locally or in Docker, every environment variable, checks, troubleshooting |
| [architecture.md](architecture.md) | Components, request chain, assessment workflow, job flow, tools, AI pipeline (with the OWASP LLM Top 10 table), security controls |
| [schema.md](schema.md) | Every table, column, index and enum. **Generated** from `apps/api/prisma/schema.prisma` |
| [acceptance.md](acceptance.md) | The acceptance checks, the live script (`npm run acceptance`) and which tests cover each check |
| [tasks.md](tasks.md) | Open work per role, as tickets (roles only, never names) |
| [adr/](adr/) | Decision records: [0001 separate platform](adr/0001-separate-platform.md), [0002 local-only deployment](adr/0002-local-only-deployment.md) |

The build plan, rules and current status live in [AGENT.md](../AGENT.md).
