import type { FindingCategory, FindingSource, FindingStatus, JobStatus, ScanStatus, Severity } from '@tanaw/shared';
import { Sparkles } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/badge';
import { humanize } from '@/lib/utils';

export const SEVERITY_TONE: Record<Severity, Tone> = { CRITICAL: 'red', HIGH: 'orange', MEDIUM: 'amber', LOW: 'blue', INFO: 'slate' };
/** Chart colors per severity (same order of intensity as the badges). */
export const SEVERITY_COLOR: Record<Severity, string> = { CRITICAL: '#b91c1c', HIGH: '#ea580c', MEDIUM: '#d97706', LOW: '#2563eb', INFO: '#64748b' };
export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const STATUS_TONE: Record<FindingStatus, Tone> = { PENDING: 'amber', CONFIRMED: 'red', REJECTED: 'slate', FALSE_POSITIVE: 'slate', FIXED: 'green' };
const SCAN_TONE: Record<ScanStatus | JobStatus, Tone> = { QUEUED: 'slate', WAITING: 'slate', RUNNING: 'blue', ACTIVE: 'blue', DONE: 'green', COMPLETED: 'green', FAILED: 'red' };

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  AUTHENTICATION: 'Authentication',
  ACCESS_CONTROL: 'Access control',
  SECURITY_CONFIG: 'Security config & HTTPS',
};

export function SeverityBadge({ severity, prefix }: { severity: Severity | null | undefined; prefix?: string }) {
  if (!severity) return <span className="text-xs text-slate-400">-</span>;
  return (
    <Badge tone={SEVERITY_TONE[severity]}>
      {prefix}
      {humanize(severity)}
    </Badge>
  );
}

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{humanize(status)}</Badge>;
}

export function RunStatusBadge({ status }: { status: ScanStatus | JobStatus }) {
  return <Badge tone={SCAN_TONE[status]}>{humanize(status)}</Badge>;
}

/** Required by AGENT.md §10: AI output is never presented as a verified vulnerability. */
export function AiUnverifiedBadge() {
  return (
    <Badge tone="purple" title="Suggested by AI from tool output. An assessor has not verified it yet.">
      <Sparkles className="h-3 w-3" aria-hidden />
      AI suggestion, not verified
    </Badge>
  );
}

export function SourceBadge({ source }: { source: FindingSource }) {
  const tone: Record<FindingSource, Tone> = { AI: 'purple', TOOL: 'blue', MANUAL: 'brand' };
  return <Badge tone={tone[source]}>{humanize(source)}</Badge>;
}
