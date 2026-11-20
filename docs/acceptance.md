# Acceptance checks

Tanaw is accepted when every check below passes. They follow the instructor's brief (AGENT.md §3), the non-negotiable
rules (§2) and the verification plan (§14). Each check is covered twice:

- **Live:** `npm run acceptance` drives a running stack (API, worker, Postgres, Redis) end to end through the real API,
  like the demo. The only scan target it uses is Tanaw's own API, so it contacts nothing outside your machine.
  It needs `localhost` in `ASSESSMENT_ALLOWED_HOSTS` and the seeded admin in `.env`. It creates two throwaway users
  (deleted at the end) and two targets named `Acceptance <timestamp>`.
- **Automated:** `npm test` runs unit and API tests (Vitest + Supertest against `TEST_DATABASE_URL`), including the
  negative cases the live run can't trigger cheaply (lockout, AI cap, token theft).

Last live run: 2026-11-20 against the full Docker stack (`ACCEPTANCE_TARGET_URL=http://host.docker.internal:4000`,
see [demo.md](demo.md)): **37 passed, 0 failed, 0 skipped**. The earlier dev-stack run skipped T3 (no Nmap on the host).

| ID | Check | Live | Automated tests |
|---|---|---|---|
| **Access control and authentication** | | | |
| A1 | API health endpoint answers | ✓ | `apps/api/src/app.test.ts` |
| A2 | Unauthenticated requests get `401` | ✓ | `auth.test.ts` (missing, garbage, foreign-signed, `alg:none` tokens) |
| A3 | Seeded admin can sign in | ✓ | `auth.test.ts` |
| A4 | Wrong password and unknown email give the same `401` | ✓ | `auth.test.ts` |
| A5 | Admin creates users; weak passwords and duplicates refused | ✓ | `user.test.ts` |
| A6 | Viewer can't register targets | ✓ | `target.test.ts` |
| A7 | Only admins manage users and read the audit log | ✓ | `user.test.ts` |
| A8 | Account locks after 5 failed logins (`429`), unlocks after 15 min | – | `auth.test.ts` |
| A9 | Per-IP login rate limit | – | `auth.test.ts` |
| A10 | Refresh token rotates; reusing an old one revokes every session | – | `auth.test.ts` |
| A11 | Deactivated or demoted users lose access at once | – | `auth.test.ts`, `user.test.ts` |
| A12 | Admins can't demote, deactivate or delete themselves | – | `user.test.ts` |
| **Scope (rule 1)** | | | |
| S1 | Hosts off `ASSESSMENT_ALLOWED_HOSTS` can't be registered | ✓ | `target.test.ts` |
| S2 | An allowlisted target can be registered | ✓ | `target.test.ts` |
| S3 | PORT_RANGE rules restrict ports | ✓ | `scope.test.ts` (rule 4), `target.test.ts` |
| S4 | In-scope HOST/URL rules can't widen past the allowlist | ✓ | `target.test.ts` |
| S5 | Out-of-scope URL rules win | ✓ | `scope.test.ts` (rule 2), `target.test.ts` |
| S6 | Other hosts, other ports and cloud-metadata (SSRF) URLs are blocked | ✓ | `scope.test.ts`, `scan.test.ts` |
| S7 | Viewer can't start scans | ✓ | `scan.test.ts` |
| S8 | Every block writes a `scope_blocked` audit row | ✓ | `target.test.ts`, `scan.test.ts` |
| S9 | Scope is re-checked by the worker at run time | – | `apps/worker/src/jobs/processJob.test.ts` |
| S10 | Scans outside the test window are refused (API and worker) | – | `scan.test.ts`, `processJob.test.ts` |
| **Tools (features 02 and 03)** | | | |
| T1 | HTTP check runs through the worker and stores results | ✓ | `tools.test.ts`, `processJob.test.ts` |
| T2 | DNS lookup completes | ✓ | `tools.test.ts` |
| T3 | Nmap service detection (fixed safe arguments, validated input) | ✓ (needs Nmap) | `tools.test.ts`; verified in the worker image |
| T4 | ZAP spider + passive scan inside a scope context, only in-scope alerts kept, redacted | – | `tools.test.ts` (fake ZAP API). Real run 2026-11-20: ZAP 2.17 container via the worker against Tanaw's own API, completed with no alerts (expected for that API). **Still to do: a run against Bayaw Jobs that produces alerts.** |
| T5 | OpenAPI endpoint listing | – | `tools.test.ts` |
| T6 | If Redis is down, scans answer `503` and are marked FAILED | – | `scan.test.ts` |
| **Imports** | | | |
| I1-I2 | In-scope Nmap XML imports with results and the raw file | ✓ | `scan.test.ts`, `node.test.ts` |
| I3 | A report with any out-of-scope host is rejected whole | ✓ | `scan.test.ts` (`samples/reports/nmap-evil.xml`) |
| I4 | ZAP JSON imports with evidence redacted | ✓ | `scan.test.ts`, `node.test.ts` |
| I5 | Wrong formats, missing and oversized files refused | ✓ (format) | `scan.test.ts` |
| I6 | XML entities are never expanded (XXE) | – | `node.test.ts` |
| **AI (feature 04, rules 4 and 5)** | | | |
| X1 | No provider configured → `503` before anything is queued | ✓ | `ai.test.ts` |
| X2 | Viewer can't spend AI calls | ✓ | `ai.test.ts` |
| X3 | Over `AI_DAILY_LIMIT` → `429`, per user | – | `ai.test.ts` |
| X4 | Input is redacted, capped, hashed and wrapped; wrapper tags stripped from data | – | `provider.test.ts`, `node.test.ts` |
| X5 | Interpretation creates only PENDING findings; made-up evidence refs are ignored | – | `jobs/ai.test.ts` |
| X6 | A malformed AI reply stores nothing and retries once | – | `jobs/ai.test.ts` |
| X7 | Remediation is a draft; the finding changes only when an assessor accepts it | – | `jobs/ai.test.ts`, `finding.test.ts` |
| X8 | A real AI run on a real scan | – | **Not done yet** (no API key on the build machine) |
| **Findings, verification, risk (feature 05, rules 5 and 6)** | | | |
| F1 | Manual findings start PENDING | ✓ | `finding.test.ts` |
| F2 | Confirming needs a final severity and a CVSS score | ✓ | `finding.test.ts` |
| F3 | Confirming needs evidence | ✓ | `finding.test.ts` |
| F4 | FIXED only after CONFIRMED; closed findings stay closed; PENDING never set by hand | ✓ | `finding.test.ts` |
| F5 | Evidence redacted; files typed by their bytes, not their names | ✓ | `finding.test.ts` |
| F6 | Viewer can't verify | ✓ | `finding.test.ts` |
| F7 | CVSS v3.1 score computed from the vector; mismatches refused | ✓ | `cvss.test.ts`, `finding.test.ts` |
| F8 | Remediation accepted or written; FIXED after retest; history kept | ✓ | `finding.test.ts` |
| F9 | Reject / false positive with notes | ✓ | `finding.test.ts` |
| F10 | Retest re-queues the original tool scan | – | `finding.test.ts` |
| **Dashboard, report, audit (feature 06)** | | | |
| R1 | Dashboard counts by status, category, source and severity | ✓ | `finding.test.ts` |
| R2 | Report holds only CONFIRMED and FIXED findings, with evidence and remediation | ✓ | `finding.test.ts` |
| R3 | Audit log records the key events | ✓ | across the API tests |
| R4 | `docs/schema.md` matches the Prisma schema | – | `apps/api/src/scripts/schemaDoc.test.ts` |

Paths: API tests are in `apps/api/src/routes/`, worker tests in `apps/worker/src/`, shared tests in
`packages/shared/src/`.

## Manual checks before the demo

These need a person and the real target:

1. Full demo flow (AGENT.md §3, steps in [demo.md](demo.md)) against the local Bayaw Jobs (`wrangler dev`, registered as `http://host.docker.internal:8787`).
2. One ZAP scan of the local Bayaw Jobs from the worker, with ALERT results (T4; the pipeline itself is verified).
3. One real AI interpretation and remediation with the team's OpenRouter key saved in Settings (X8); note tokens and cost.
4. Report exported to PDF from Chrome and checked page by page.
5. Then, with the instructor's written approval, the same flow against the approved Bayaw Jobs environment.
