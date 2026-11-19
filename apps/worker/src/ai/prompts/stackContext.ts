// Trusted facts about the TARGET application (Bayaw Jobs) that the remediation prompt can rely on.
// TODO(AI integration): keep this accurate as Bayaw Jobs changes. Short bullet facts work better than prose.
// Never put secrets, hostnames of private systems or personal data here.

export const STACK_CONTEXT = `Target app: Bayaw Jobs (job portal), owned by the assessment team.
- Backend: Express 5 + TypeScript on Cloudflare Workers (nodejs_compat), Helmet, Zod validation, JWT access tokens + refresh cookie.
- Frontend: Next.js (App Router) on Cloudflare Workers via OpenNext.
- Data: Cloudflare D1 (SQLite) through Prisma, R2 for files, Cloudflare Queues for email.
- Security headers and CORS are set in the Express app; Worker settings live in wrangler.jsonc.`;
