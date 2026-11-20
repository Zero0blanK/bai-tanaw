import type { FindingCategory, FindingSource, FindingStatus, JobStatus, ScanStatus, Severity } from '@tanaw/shared';
import { Sparkles } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/badge';
import { humanize } from '@/lib/utils';

export const SEVERITY_TONE: Record<Severity, Tone> = { CRITICAL: 'red', HIGH: 'red', MEDIUM: 'orange', LOW: 'slate', INFO: 'slate' };
/**
 * Severity markers: the signal fades with the severity. Critical and high are red, medium orange, low and info
 * grey, so the eye goes to what matters first. Labels always accompany the colour.
 */
export const SEVERITY_COLOR: Record<Severity, string> = { CRITICAL: '#8f1209', HIGH: '#d52b1e', MEDIUM: '#e8871e', LOW: '#63635f', INFO: '#b8b8b3' };
export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

const STATUS_TONE: Record<FindingStatus, Tone> = { PENDING: 'amber', CONFIRMED: 'red', REJECTED: 'slate', FALSE_POSITIVE: 'slate', FIXED: 'green' };
const SCAN_TONE: Record<ScanStatus | JobStatus, Tone> = { QUEUED: 'slate', WAITING: 'slate', RUNNING: 'blue', ACTIVE: 'blue', DONE: 'green', COMPLETED: 'green', FAILED: 'red' };

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  AUTHENTICATION: 'Authentication',
  ACCESS_CONTROL: 'Access control',
  SECURITY_CONFIG: 'Security config & HTTPS',
};

export function SeverityBadge({ severity, prefix }: { severity: Severity | null | undefined; prefix?: string }) {
  if (!severity) return <span className="text-xs text-ink-400">-</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-black">
      <span aria-hidden className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: SEVERITY_COLOR[severity] }} />
      {prefix && <span className="font-medium text-ink-500">{prefix}</span>}
      {humanize(severity)}
    </span>
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

/** Where a finding came from, in words an assessor reads at a glance. */
export const SOURCE_LABEL: Record<FindingSource, string> = { TOOL: 'Tool rule', AI: 'AI', MANUAL: 'Manual test' };

export function SourceBadge({ source }: { source: FindingSource }) {
  const tone: Record<FindingSource, Tone> = { AI: 'purple', TOOL: 'blue', MANUAL: 'brand' };
  return (
    <Badge tone={tone[source]} title={source === 'TOOL' ? 'Raised automatically by a fixed rule from the scan results.' : undefined}>
      {SOURCE_LABEL[source]}
    </Badge>
  );
}
