// Response shapes from the Bai-Tanaw API (apps/api). Enum unions come from @tanaw/shared.

import type {
  AiTask,
  EvidenceType,
  FindingCategory,
  FindingSource,
  FindingStatus,
  JobStatus,
  JobType,
  Role,
  ScanResultType,
  ScanSource,
  ScanStatus,
  ScanTool,
  ScopeAssetType,
  Severity,
} from '@tanaw/shared';

export interface UserRef {
  id: string;
  name: string;
  email: string;
}

export interface User extends UserRef {
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScopeRule {
  id: string;
  target_id: string;
  asset_type: ScopeAssetType;
  value: string;
  in_scope: boolean;
  notes: string | null;
  created_at: string;
}

export interface Target {
  id: string;
  name: string;
  base_url: string;
  description: string | null;
  authorization_note: string | null;
  test_window_start: string | null;
  test_window_end: string | null;
  created_at: string;
  updated_at: string;
  creator?: UserRef | null;
  scope_rules?: ScopeRule[];
  _count?: { scope_rules?: number; scans: number; findings: number };
}

export interface Scan {
  id: string;
  target_id: string;
  tool: ScanTool;
  source: ScanSource;
  status: ScanStatus;
  params: { url?: string; host?: string; ports?: string; filename?: string; discover?: boolean; found_url?: string } | null;
  raw_output_path: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  starter?: UserRef | null;
  target?: { id: string; name: string; base_url: string };
  _count?: { results: number; findings: number };
}

export interface ScanResult {
  id: string;
  scan_id: string;
  type: ScanResultType;
  data: Record<string, unknown>;
  created_at: string;
}

export interface ScanDetail extends Scan {
  results: ScanResult[];
  result_counts: Partial<Record<ScanResultType, number>>;
}

export interface Job {
  id: string;
  type: JobType;
  ref_id: string;
  status: JobStatus;
  attempts: number;
  failed_reason: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
}

export interface Evidence {
  id: string;
  finding_id: string;
  scan_result_id: string | null;
  type: EvidenceType;
  file_path: string | null;
  content: string | null;
  created_at: string;
  creator?: UserRef | null;
  scan_result?: { id: string; type: ScanResultType; data: Record<string, unknown> } | null;
}

export interface VerificationLog {
  id: string;
  old_status: FindingStatus;
  new_status: FindingStatus;
  notes: string;
  created_at: string;
  assessor: UserRef | null;
}

export interface Finding {
  id: string;
  target_id: string;
  scan_id: string | null;
  title: string;
  category: FindingCategory;
  description: string;
  affected_asset: string;
  source: FindingSource;
  ai_severity: Severity | null;
  final_severity: Severity | null;
  cvss_vector: string | null;
  cvss_score: number | null;
  owasp_top10: string | null;
  wstg_id: string | null;
  status: FindingStatus;
  remediation: string | null;
  /** Filled automatically when the finding is raised; accepted into `remediation` by an assessor. */
  suggested_remediation: string | null;
  suggested_cvss_vector: string | null;
  suggested_cvss_score: number | null;
  /** CVE IDs named by the tool output behind the finding. */
  cve_ids: string[];
  created_at: string;
  updated_at: string;
  target?: { id: string; name: string; base_url?: string };
  _count?: { evidence: number };
}

export interface FindingDetail extends Finding {
  scan: Pick<Scan, 'id' | 'tool' | 'source' | 'status' | 'params' | 'created_at'> | null;
  evidence: Evidence[];
  verification_logs: VerificationLog[];
  allowed_transitions: FindingStatus[];
}

export interface AiAnalysis {
  id: string;
  scan_id: string | null;
  finding_id: string | null;
  task: AiTask;
  provider: string;
  model: string;
  output: Record<string, unknown>;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
  creator: UserRef | null;
}

export interface RemediationDraft {
  summary: string;
  steps: string[];
  code_example: string;
  references: string[];
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export type Counts = Record<string, number>;

export interface Dashboard {
  target_id: string | null;
  totals: { findings: number; open_confirmed: number; pending_review: number; fixed: number };
  findings: {
    by_status: Counts;
    by_category: Counts;
    by_source: Counts;
    confirmed_by_severity: Counts;
    pending_by_ai_severity: Counts;
  };
  scans: { by_status: Counts; by_tool: Counts };
}

export interface ReportFinding {
  id: string;
  title: string;
  category: FindingCategory;
  status: FindingStatus;
  severity: Severity | null;
  cvss_score: number | null;
  cvss_vector: string | null;
  cvss_rating: Severity | null;
  owasp_top10: string | null;
  wstg_id: string | null;
  source: FindingSource;
  ai_suggested_severity: Severity | null;
  affected_asset: string;
  description: string;
  remediation: string | null;
  cve_ids: string[];
  verified: { by: string; at: string; status: FindingStatus; notes: string } | null;
  history: Array<{ from: FindingStatus; to: FindingStatus; by: string; at: string; notes: string }>;
  evidence: Array<{ id: string; type: EvidenceType; has_file: boolean; file_url: string | null; content: string | null; created_at: string }>;
}

export interface Report {
  generated_at: string;
  target: Pick<Target, 'id' | 'name' | 'base_url' | 'description' | 'authorization_note' | 'test_window_start' | 'test_window_end'>;
  scope: Array<{ asset_type: ScopeAssetType; value: string; in_scope: boolean; notes: string | null }>;
  methodology: { phases: string[]; frameworks: string[]; categories: string[]; tools: ScanTool[] };
  scans: Array<{ id: string; tool: ScanTool; source: ScanSource; status: ScanStatus; started_at: string | null; finished_at: string | null; results: number }>;
  summary: Dashboard['totals'] & Dashboard['findings'];
  findings: ReportFinding[];
}

export interface AuditLog {
  id: string;
  action: string;
  actor_id: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
  actor: UserRef | null;
}
