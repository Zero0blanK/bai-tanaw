# Database schema

<!-- GENERATED from apps/api/prisma/schema.prisma by apps/api/src/scripts/schemaDoc.ts. Do not edit by hand. -->
<!-- Regenerate: npm run docs:schema --workspace @tanaw/api -->

PostgreSQL 16 through Prisma 6. Every id is a UUID. Columns that point at a user (`created_by`, `started_by`,
`assessor_id`, `actor_id`) are nullable foreign keys with `ON DELETE SET NULL`, so deleting a user keeps the history.
Shapes of `scan_results.data` are in `packages/shared/src/schemas/scanResults.ts` (AGENT.md §7.4).

## Tables

- [`users`](#users)
- [`refresh_tokens`](#refresh_tokens)
- [`audit_logs`](#audit_logs)
- [`assessment_targets`](#assessment_targets)
- [`scope_rules`](#scope_rules)
- [`scans`](#scans)
- [`scan_results`](#scan_results)
- [`findings`](#findings)
- [`evidence`](#evidence)
- [`ai_analyses`](#ai_analyses): Every AI call is recorded, so the report can show what the AI said and when.
- [`verification_logs`](#verification_logs)
- [`jobs`](#jobs): Mirrors the BullMQ job. The queue message carries only { jobId }.
- [`app_settings`](#app_settings): Settings an admin changes in the app (one row per area, e.g. "ai"). Secrets never sit here as plain text:\n`secret` is AES-256-GCM ciphertext keyed from SETTINGS_ENCRYPTION_KEY (see @tanaw/shared/node secretBox).

### users

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `email` | String | no |  | unique |
| `password_hash` | String | no |  |  |
| `name` | String | no |  |  |
| `role` | enum [Role](#enum-role) | no | `VIEWER` |  |
| `is_active` | Boolean | no | `true` |  |
| `failed_login_attempts` | Int | no | `0` |  |
| `locked_until` | DateTime | yes |  |  |
| `last_login_at` | DateTime | yes |  |  |
| `created_at` | DateTime | no | now() |  |
| `updated_at` | DateTime | no | auto (updated at) |  |

### refresh_tokens

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `user_id` | String (Uuid) | no |  | FK → `users.id` (on delete cascade) |
| `token_hash` | String | no |  | unique; HMAC-SHA256 of the raw token (keyed with JWT_REFRESH_SECRET). The raw token only lives in the cookie. |
| `expires_at` | DateTime | no |  |  |
| `revoked_at` | DateTime | yes |  |  |
| `replaced_by` | String (Uuid) | yes |  | Set when this token was rotated; reuse of a rotated token revokes every session of the user. |
| `user_agent` | String | yes |  |  |
| `ip` | String | yes |  |  |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (user_id)`.

### audit_logs

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `actor_id` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `action` | String | no |  | snake_case event name, e.g. login_success, login_failed, scope_blocked, finding_verified |
| `target_id` | String (Uuid) | yes |  | FK → `assessment_targets.id` (on delete setnull) |
| `metadata` | Json | yes |  |  |
| `ip` | String | yes |  |  |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (created_at)`, `index (actor_id, created_at)`, `index (action, created_at)`.

### assessment_targets

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `name` | String | no |  |  |
| `base_url` | String | no |  |  |
| `description` | String | yes |  |  |
| `authorization_note` | String | yes |  |  |
| `test_window_start` | DateTime | yes |  |  |
| `test_window_end` | DateTime | yes |  |  |
| `created_by` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `created_at` | DateTime | no | now() |  |
| `updated_at` | DateTime | no | auto (updated at) |  |

### scope_rules

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `target_id` | String (Uuid) | no |  | FK → `assessment_targets.id` (on delete cascade) |
| `asset_type` | enum [ScopeAssetType](#enum-scopeassettype) | no |  |  |
| `value` | String | no |  |  |
| `in_scope` | Boolean | no | `true` |  |
| `notes` | String | yes |  |  |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (target_id)`.

### scans

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `target_id` | String (Uuid) | no |  | FK → `assessment_targets.id` (on delete cascade) |
| `tool` | enum [ScanTool](#enum-scantool) | no |  |  |
| `source` | enum [ScanSource](#enum-scansource) | no |  |  |
| `status` | enum [ScanStatus](#enum-scanstatus) | no | `QUEUED` |  |
| `params` | Json | yes |  |  |
| `raw_output_path` | String | yes |  | Path under STORAGE_LOCAL_DIR of the raw tool output or uploaded report. |
| `error` | String | yes |  |  |
| `started_by` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `started_at` | DateTime | yes |  |  |
| `finished_at` | DateTime | yes |  |  |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (target_id, created_at)`, `index (status)`.

### scan_results

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `scan_id` | String (Uuid) | no |  | FK → `scans.id` (on delete cascade) |
| `type` | enum [ScanResultType](#enum-scanresulttype) | no |  |  |
| `data` | Json | no |  | Shape depends on type: see packages/shared/src/schemas/scanResults.ts |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (scan_id, type)`.

### findings

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `target_id` | String (Uuid) | no |  | FK → `assessment_targets.id` (on delete cascade) |
| `scan_id` | String (Uuid) | yes |  | FK → `scans.id` (on delete setnull) |
| `title` | String | no |  |  |
| `category` | enum [FindingCategory](#enum-findingcategory) | no |  |  |
| `description` | String | no |  |  |
| `affected_asset` | String | no |  |  |
| `source` | enum [FindingSource](#enum-findingsource) | no |  |  |
| `ai_severity` | enum [Severity](#enum-severity) | yes |  |  |
| `final_severity` | enum [Severity](#enum-severity) | yes |  |  |
| `cvss_vector` | String | yes |  |  |
| `cvss_score` | Float | yes |  |  |
| `owasp_top10` | String | yes |  |  |
| `wstg_id` | String | yes |  |  |
| `status` | enum [FindingStatus](#enum-findingstatus) | no | `PENDING` | Only PATCH /api/findings/:id/verify changes this. AI and tools only ever create PENDING. |
| `remediation` | String | yes |  |  |
| `fingerprint` | String | yes |  | "Same problem on the same asset" key from the tool rules (or "ai:<title>"), used so re-scans don't duplicate\nopen findings. Null for manual findings. |
| `created_at` | DateTime | no | now() |  |
| `updated_at` | DateTime | no | auto (updated at) |  |

Indexes: `index (target_id, status)`, `index (target_id, fingerprint)`, `index (scan_id)`.

### evidence

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `finding_id` | String (Uuid) | no |  | FK → `findings.id` (on delete cascade) |
| `scan_result_id` | String (Uuid) | yes |  | FK → `scan_results.id` (on delete setnull) |
| `type` | enum [EvidenceType](#enum-evidencetype) | no |  |  |
| `file_path` | String | yes |  | Path under STORAGE_LOCAL_DIR (screenshots, raw files). |
| `content` | String | yes |  |  |
| `created_by` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (finding_id)`.

### ai_analyses

Every AI call is recorded, so the report can show what the AI said and when.

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `scan_id` | String (Uuid) | yes |  |  |
| `finding_id` | String (Uuid) | yes |  | FK → `findings.id` (on delete cascade) |
| `task` | enum [AiTask](#enum-aitask) | no |  |  |
| `provider` | String | no |  |  |
| `model` | String | no |  |  |
| `input_hash` | String | no |  | SHA-256 of the redacted input actually sent. |
| `output` | Json | no |  |  |
| `tokens_in` | Int | yes |  |  |
| `tokens_out` | Int | yes |  |  |
| `created_by` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (scan_id)`, `index (finding_id)`, `index (created_by, created_at)`.

### verification_logs

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `finding_id` | String (Uuid) | no |  | FK → `findings.id` (on delete cascade) |
| `assessor_id` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `old_status` | enum [FindingStatus](#enum-findingstatus) | no |  |  |
| `new_status` | enum [FindingStatus](#enum-findingstatus) | no |  |  |
| `notes` | String | no |  |  |
| `created_at` | DateTime | no | now() |  |

Indexes: `index (finding_id)`.

### jobs

Mirrors the BullMQ job. The queue message carries only { jobId }.

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `id` | String (Uuid) | no | uuid() | PK |
| `type` | enum [JobType](#enum-jobtype) | no |  |  |
| `ref_id` | String (Uuid) | no |  | The scan or finding this job works on. |
| `bull_job_id` | String | yes |  |  |
| `status` | enum [JobStatus](#enum-jobstatus) | no | `WAITING` |  |
| `payload` | Json | yes |  |  |
| `attempts` | Int | no | `0` |  |
| `failed_reason` | String | yes |  |  |
| `result` | Json | yes |  | Small summary for the client when the job is done, e.g. { analysis_id, findings_created }. |
| `created_by` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `created_at` | DateTime | no | now() |  |
| `started_at` | DateTime | yes |  |  |
| `finished_at` | DateTime | yes |  |  |

Indexes: `index (type, status)`, `index (ref_id)`, `index (created_by, created_at)`.

### app_settings

Settings an admin changes in the app (one row per area, e.g. "ai"). Secrets never sit here as plain text:\n`secret` is AES-256-GCM ciphertext keyed from SETTINGS_ENCRYPTION_KEY (see @tanaw/shared/node secretBox).

| Column | Type | Null | Default | Key / notes |
|---|---|---|---|---|
| `key` | String | no |  | PK; Area name, e.g. "ai" |
| `value` | Json | no | `{}` | Non-secret values, e.g. { provider, model } |
| `secret` | String | yes |  | Encrypted secret ("v1.<salt>.<iv>.<tag>.<ciphertext>"), e.g. the AI provider API key |
| `secret_hint` | String | yes |  | Last 4 characters of the secret, for the UI |
| `updated_by` | String (Uuid) | yes |  | FK → `users.id` (on delete setnull) |
| `created_at` | DateTime | no | now() |  |
| `updated_at` | DateTime | no | auto (updated at) |  |

## Enums

### Enum Role

`ADMIN` · `ASSESSOR` · `VIEWER`

### Enum ScopeAssetType

`HOST` · `URL` · `PORT_RANGE`

### Enum ScanTool

`HTTP_CHECK` · `DNS` · `OPENAPI` · `NMAP` · `ZAP` · `MANUAL`

### Enum ScanSource

`WORKER` · `IMPORT`

### Enum ScanStatus

`QUEUED` · `RUNNING` · `DONE` · `FAILED`

### Enum ScanResultType

`PORT` · `SERVICE` · `DNS_RECORD` · `ENDPOINT` · `ALERT` · `HEADER` · `COOKIE` · `CORS` · `REDIRECT`

### Enum FindingCategory

`AUTHENTICATION` · `ACCESS_CONTROL` · `SECURITY_CONFIG`

### Enum FindingSource

`TOOL` · `AI` · `MANUAL`

### Enum Severity

`CRITICAL` · `HIGH` · `MEDIUM` · `LOW` · `INFO`

### Enum FindingStatus

`PENDING` · `CONFIRMED` · `REJECTED` · `FALSE_POSITIVE` · `FIXED`

### Enum EvidenceType

`SCREENSHOT` · `HTTP_EXCHANGE` · `TOOL_OUTPUT`

### Enum AiTask

`INTERPRET` · `REMEDIATE`

### Enum JobType

`RUN_CHECK` · `RUN_NMAP` · `RUN_ZAP` · `INTERPRET` · `REMEDIATE`

### Enum JobStatus

`WAITING` · `ACTIVE` · `COMPLETED` · `FAILED`
