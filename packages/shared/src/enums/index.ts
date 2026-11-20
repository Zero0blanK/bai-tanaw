// Every enum Bai-Tanaw uses, as readonly tuples (for Zod and Prisma parity) plus a union type.
// The Prisma schema in apps/api mirrors these values exactly; change both together.

export const ROLES = ['ADMIN', 'ASSESSOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

/** The three assessment categories chosen for the project (AGENT.md §3). */
export const FINDING_CATEGORIES = ['AUTHENTICATION', 'ACCESS_CONTROL', 'SECURITY_CONFIG'] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_SOURCES = ['TOOL', 'AI', 'MANUAL'] as const;
export type FindingSource = (typeof FINDING_SOURCES)[number];

export const FINDING_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'FALSE_POSITIVE', 'FIXED'] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

export const SCOPE_ASSET_TYPES = ['HOST', 'URL', 'PORT_RANGE'] as const;
export type ScopeAssetType = (typeof SCOPE_ASSET_TYPES)[number];

export const SCAN_TOOLS = ['HTTP_CHECK', 'DNS', 'OPENAPI', 'NMAP', 'ZAP', 'MANUAL'] as const;
export type ScanTool = (typeof SCAN_TOOLS)[number];

/** Tools the API can queue for the worker (MANUAL is never queued). */
export const RUNNABLE_TOOLS = ['HTTP_CHECK', 'DNS', 'OPENAPI', 'NMAP', 'ZAP'] as const;
export type RunnableTool = (typeof RUNNABLE_TOOLS)[number];

export const SCAN_SOURCES = ['WORKER', 'IMPORT'] as const;
export type ScanSource = (typeof SCAN_SOURCES)[number];

export const SCAN_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const SCAN_RESULT_TYPES = [
  'PORT',
  'SERVICE',
  'DNS_RECORD',
  'ENDPOINT',
  'ALERT',
  'HEADER',
  'COOKIE',
  'CORS',
  'REDIRECT',
] as const;
export type ScanResultType = (typeof SCAN_RESULT_TYPES)[number];

export const EVIDENCE_TYPES = ['SCREENSHOT', 'HTTP_EXCHANGE', 'TOOL_OUTPUT'] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const AI_TASKS = ['INTERPRET', 'REMEDIATE'] as const;
export type AiTask = (typeof AI_TASKS)[number];

/** Where AI calls go. OpenRouter and OpenAI need an API key (entered in Settings, stored encrypted); Ollama doesn't. */
export const AI_PROVIDERS = ['openrouter', 'openai', 'ollama'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const AI_DEFAULT_MODELS: Record<AiProvider, string> = {
  openrouter: 'openai/gpt-4.1-mini',
  openai: 'gpt-4.1-mini',
  ollama: 'llama3.1:8b',
};
export const aiProviderNeedsKey = (provider: AiProvider): boolean => provider !== 'ollama';

export const AI_CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type AiConfidence = (typeof AI_CONFIDENCE)[number];

export const JOB_TYPES = ['RUN_CHECK', 'RUN_NMAP', 'RUN_ZAP', 'INTERPRET', 'REMEDIATE'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['WAITING', 'ACTIVE', 'COMPLETED', 'FAILED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Which job type runs each tool. */
export const TOOL_JOB_TYPE: Record<RunnableTool, JobType> = {
  HTTP_CHECK: 'RUN_CHECK',
  DNS: 'RUN_CHECK',
  OPENAPI: 'RUN_CHECK',
  NMAP: 'RUN_NMAP',
  ZAP: 'RUN_ZAP',
};

/** BullMQ queue name shared by the API (producer) and the worker (consumer). */
export const ASSESSMENT_QUEUE = 'tanaw-assessment';

/** BullMQ attempts per job type. Tool runs are never retried (a second scan is noise on the target); AI calls retry once. */
export const JOB_ATTEMPTS: Record<JobType, number> = {
  RUN_CHECK: 1,
  RUN_NMAP: 1,
  RUN_ZAP: 1,
  INTERPRET: 2,
  REMEDIATE: 2,
};

const MANILA_OFFSET_MS = 8 * 3600 * 1000; // Asia/Manila is UTC+8 all year.

/** Midnight today in Philippine time, as a UTC instant. The AI daily cap counts from here. */
export function startOfManilaDay(now = new Date()): Date {
  const local = new Date(now.getTime() + MANILA_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - MANILA_OFFSET_MS);
}
