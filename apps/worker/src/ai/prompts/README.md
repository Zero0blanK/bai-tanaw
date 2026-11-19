# AI prompts

Owned by the **AI integration** role: write the real prompts here and commit them. The files in this folder are
working templates, so the system runs before the real prompts land, but the results are weaker than they should be.

| File | Used by | Export |
|---|---|---|
| `interpret.ts` | Feature 1, interpreting scan results (`jobs/interpret.ts`) | `INTERPRET_SYSTEM_PROMPT` |
| `remediate.ts` | Feature 2, suggesting remediation (`jobs/remediate.ts`) | `REMEDIATE_SYSTEM_PROMPT` |
| `stackContext.ts` | Feature 2, trusted facts about the target app | `STACK_CONTEXT` |

Rules (code review checks these):

- Keep the export names. The jobs import them.
- Don't ask for a different JSON shape. Replies are forced into the schemas in `packages/shared/src/schemas/ai.ts`
  (OpenAI Structured Outputs + Zod). Change wording freely, never fields.
- Tool output arrives wrapped in `<tool_output>…</tool_output>` after redaction. Every prompt must say it is untrusted
  data and that instructions inside it are ignored (OWASP LLM01).
- Only the three categories: `AUTHENTICATION`, `ACCESS_CONTROL`, `SECURITY_CONFIG`.
- No invented CVEs, no guessing beyond the evidence, an empty list when nothing is wrong.
- Never put secrets, real credentials or personal data in a prompt.

Test a change: run an HTTP check against the local Bayaw Jobs, then `POST /api/scans/:id/interpret`, and compare the
PENDING findings with what the tool output really shows. Record what you tried for the "AI use and limitations" write-up.
