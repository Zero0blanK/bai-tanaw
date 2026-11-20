# @tanaw/worker

BullMQ consumer. Runs the jobs the API queues:

- `tools/`: Nmap (via `execFile`, argument arrays only), ZAP (daemon API), HTTP header/cookie/CORS/redirect checks, DNS, OpenAPI import
- `parsers/`: Nmap XML and ZAP JSON → normalized scan results (also used for uploaded reports)
- `ai/`: OpenAI-first provider, redaction, schemas, the two AI features; `ai/prompts/` holds the prompts (owned by the AI integration role)

Every job re-checks scope before touching a host. See [docs/architecture.md](../../docs/architecture.md).
