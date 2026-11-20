// Request body/query contracts shared by the API (validation) and the web (forms).
// The API wraps these in { params, body, query } objects in apps/api/src/validations.

import { z } from 'zod';
import {
  EVIDENCE_TYPES,
  FINDING_CATEGORIES,
  FINDING_SOURCES,
  FINDING_STATUSES,
  ROLES,
  RUNNABLE_TOOLS,
  SCAN_RESULT_TYPES,
  SCOPE_ASSET_TYPES,
  SEVERITIES,
} from '../enums/index.js';
import { isValidPortSpec, parseHttpUrl } from '../scope.js';

export const uuid = (label: string) => z.uuid(`${label} must be a valid UUID`);

const httpUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(500)
    .refine((v) => parseHttpUrl(v) !== null, `${label} must be a valid http(s) URL without credentials`);

const portSpec = z
  .string()
  .trim()
  .refine(isValidPortSpec, 'ports must look like "80,443" or "8000-8100" (1-65535)');

/** CVSS v3.1 base vector, e.g. CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N */
export const CVSS_VECTOR_RE =
  /^CVSS:3\.1\/AV:[NALP]\/AC:[LH]\/PR:[NLH]\/UI:[NR]\/S:[UC]\/C:[NLH]\/I:[NLH]\/A:[NLH]$/;

/** Login passwords: 12+ chars with upper, lower, digit and symbol. */
export const passwordSchema = z
  .string()
  .min(12, 'password must be at least 12 characters')
  .max(128)
  .regex(/[a-z]/, 'password needs a lowercase letter')
  .regex(/[A-Z]/, 'password needs an uppercase letter')
  .regex(/\d/, 'password needs a digit')
  .regex(/[^A-Za-z0-9]/, 'password needs a symbol');

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Auth & users ─────────────────────────────────────────────────────────────

export const LoginBody = z.object({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
});

export const ChangePasswordBody = z
  .object({
    current_password: z.string().min(1).max(128),
    new_password: passwordSchema,
  })
  .refine((b) => b.current_password !== b.new_password, {
    path: ['new_password'],
    message: 'new password must differ from the current one',
  });

export const CreateUserBody = z.object({
  email: z.email().trim().toLowerCase().max(254),
  name: z.string().trim().min(2).max(120),
  password: passwordSchema,
  role: z.enum(ROLES),
});

export const UpdateUserBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(ROLES).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'nothing to update');

// ─── Targets & scope ──────────────────────────────────────────────────────────

const optionalDate = z.coerce.date().optional();

export const CreateTargetBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    base_url: httpUrl('base_url'),
    description: z.string().max(2000).optional(),
    authorization_note: z.string().max(2000).optional(),
    test_window_start: optionalDate,
    test_window_end: optionalDate,
  })
  .refine((b) => !b.test_window_start || !b.test_window_end || b.test_window_start <= b.test_window_end, {
    message: 'test_window_end must be after test_window_start',
    path: ['test_window_end'],
  });

export const UpdateTargetBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(2000).optional(),
  authorization_note: z.string().max(2000).optional(),
  test_window_start: optionalDate,
  test_window_end: optionalDate,
});

export const AddScopeRuleBody = z
  .object({
    asset_type: z.enum(SCOPE_ASSET_TYPES),
    value: z.string().trim().min(1).max(300),
    in_scope: z.boolean().default(true),
    notes: z.string().max(500).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.asset_type === 'PORT_RANGE' && !isValidPortSpec(b.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'PORT_RANGE value must look like "80,443" or "8000-8100"' });
    }
    if (b.asset_type === 'URL' && parseHttpUrl(b.value) === null) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'URL value must be a valid http(s) URL' });
    }
    if (b.asset_type === 'HOST' && !/^[a-z0-9.-]+$/i.test(b.value)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'HOST value must be a bare hostname or IPv4 address' });
    }
  });

/** Dry-run scope check: "would this URL/host/port be allowed for this target?" */
export const ScopeCheckBody = z
  .object({
    url: z.string().trim().max(500).optional(),
    host: z.string().trim().min(1).max(253).optional(),
    port: z.number().int().min(1).max(65535).optional(),
  })
  .refine((b) => b.url !== undefined || b.host !== undefined, 'give a url or a host');

// ─── Scans ────────────────────────────────────────────────────────────────────

export const StartScanBody = z.object({
  tool: z.enum(RUNNABLE_TOOLS),
  url: httpUrl('url').optional(),
  host: z.string().trim().min(1).max(253).optional(),
  ports: portSpec.optional(),
});

export const ScanResultsQuery = paginationQuery.extend({
  type: z.enum(SCAN_RESULT_TYPES).optional(),
});

// ─── Findings ─────────────────────────────────────────────────────────────────

export const ListFindingsQuery = paginationQuery.extend({
  target_id: uuid('target_id').optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  category: z.enum(FINDING_CATEGORIES).optional(),
  source: z.enum(FINDING_SOURCES).optional(),
});

export const CreateFindingBody = z.object({
  target_id: uuid('target_id'),
  scan_id: uuid('scan_id').optional(),
  title: z.string().trim().min(3).max(200),
  category: z.enum(FINDING_CATEGORIES),
  description: z.string().trim().min(10).max(4000),
  affected_asset: z.string().trim().min(1).max(300),
  owasp_top10: z.string().max(80).optional(),
  wstg_id: z.string().max(40).optional(),
});

/** Statuses an assessor can set. PENDING is never set by hand. */
export const VERIFY_STATUSES = ['CONFIRMED', 'REJECTED', 'FALSE_POSITIVE', 'FIXED'] as const;

export const VerifyFindingBody = z.object({
  status: z.enum(VERIFY_STATUSES),
  notes: z.string().trim().min(5, 'notes must explain how you verified this (at least 5 characters)').max(4000),
  final_severity: z.enum(SEVERITIES).optional(),
  cvss_score: z.number().min(0).max(10).optional(),
  cvss_vector: z.string().regex(CVSS_VECTOR_RE, 'cvss_vector must be a CVSS v3.1 vector').optional(),
  owasp_top10: z.string().max(80).optional(),
  wstg_id: z.string().max(40).optional(),
});

export const SetRemediationBody = z
  .object({
    remediation: z.string().trim().min(10).max(8000).optional(),
    analysis_id: uuid('analysis_id').optional(),
  })
  .refine((b) => Boolean(b.remediation) !== Boolean(b.analysis_id), {
    message: 'Provide exactly one of remediation or analysis_id',
    path: ['remediation'],
  });

export const AddEvidenceBody = z.object({
  type: z.enum(EVIDENCE_TYPES),
  content: z.string().max(20000).optional(),
  scan_result_id: uuid('scan_result_id').optional(),
});

export const DashboardQuery = z.object({ target_id: uuid('target_id').optional() });

export type LoginInput = z.infer<typeof LoginBody>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordBody>;
export type CreateUserInput = z.infer<typeof CreateUserBody>;
export type UpdateUserInput = z.infer<typeof UpdateUserBody>;
export type CreateTargetInput = z.infer<typeof CreateTargetBody>;
export type UpdateTargetInput = z.infer<typeof UpdateTargetBody>;
export type AddScopeRuleInput = z.infer<typeof AddScopeRuleBody>;
export type ScopeCheckInput = z.infer<typeof ScopeCheckBody>;
export type StartScanInput = z.infer<typeof StartScanBody>;
export type ListFindingsInput = z.infer<typeof ListFindingsQuery>;
export type CreateFindingInput = z.infer<typeof CreateFindingBody>;
export type VerifyFindingInput = z.infer<typeof VerifyFindingBody>;
export type SetRemediationInput = z.infer<typeof SetRemediationBody>;
export type AddEvidenceInput = z.infer<typeof AddEvidenceBody>;
