'use client';

import { FINDING_CATEGORIES, FINDING_SOURCES, type FindingStatus } from '@tanaw/shared';
import { ArrowRight, Paperclip, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { CveList, CvssTag } from '@/components/findings/cve-list';
import { DecisionDialog, type QuickDecision } from '@/components/findings/decision-dialog';
import { ManualFindingForm } from '@/components/findings/manual-finding-form';
import { useAuth } from '@/components/shared/auth-provider';
import { AiUnverifiedBadge, CATEGORY_LABEL, FindingStatusBadge, SEVERITY_COLOR, SeverityBadge, SOURCE_LABEL, SourceBadge } from '@/components/shared/badges';
import { DetailList, PageHeader, Pagination } from '@/components/shared/page';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert, Empty, SkeletonRows, Spinner } from '@/components/ui/feedback';
import { Label, SearchInput, Select } from '@/components/ui/form';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/hooks/useApi';
import { useReloadOn } from '@/hooks/useReloadOn';
import { PENDING_CHANGED_EVENT } from '@/lib/api';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import type { Finding, FindingDetail, Target } from '@/types/api';

const FILTERS = ['target_id', 'status', 'category', 'source', 'q'] as const;

/** Status is the main way to slice findings, so it gets tabs; the rest are secondary filters. */
const STATUS_TABS: Array<{ value: FindingStatus | ''; label: string }> = [
  { value: 'PENDING', label: 'To verify' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'FIXED', label: 'Fixed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'FALSE_POSITIVE', label: 'False positive' },
  { value: '', label: 'All' },
];

function age(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

function RowBody({ f, selected }: { f: Finding; selected: boolean }) {
  const severity = f.final_severity ?? f.ai_severity;
  return (
    <>
      <span aria-hidden className="w-1.5 shrink-0 self-stretch" style={{ backgroundColor: severity ? SEVERITY_COLOR[severity] : 'var(--color-ink-200)' }} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm leading-snug text-black', selected ? 'font-extrabold' : 'font-bold')}>{f.title}</span>
        <span className="mt-1 block truncate text-xs text-ink-500">
          {f.target?.name} <span className="text-ink-300">/</span> {f.affected_asset}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={severity} {...(f.final_severity ? {} : { prefix: 'Suggested' })} />
          {f.cvss_score !== null ? <CvssTag score={f.cvss_score} vector={f.cvss_vector} /> : <CvssTag score={f.suggested_cvss_score} vector={f.suggested_cvss_vector} />}
          {f.cve_ids.length > 0 && <span className="text-xs font-bold text-black">{f.cve_ids.length === 1 ? f.cve_ids[0] : `${f.cve_ids.length} CVEs`}</span>}
          <span className="text-xs text-ink-500">{SOURCE_LABEL[f.source]}</span>
          {f.status !== 'PENDING' && <FindingStatusBadge status={f.status} />}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 text-xs tabular-nums text-ink-400">
        <span>{age(f.created_at)}</span>
        <span className="flex items-center gap-0.5" title="Evidence items">
          <Paperclip className="h-3 w-3" aria-hidden />
          {f._count?.evidence ?? 0}
        </span>
      </span>
    </>
  );
}

const rowClass = (selected: boolean) =>
  cn('flex w-full gap-3 border-b border-ink-200 py-3 pr-4 text-left transition-colors', selected ? 'bg-ink-100' : 'hover:bg-ink-50');

/** The selected finding, read in place: everything needed to decide, plus the decisions that need no evidence. */
function Preview({ id, canVerify, onDecided }: { id: string; canVerify: boolean; onDecided: (verb: string) => void }) {
  const detail = useApi<FindingDetail>(`/findings/${id}`);
  const [decision, setDecision] = useState<QuickDecision | null>(null);
  const f = detail.data;
  if (detail.loading && !f) return <Spinner />;
  if (detail.error || !f) return <Alert kind="error">{detail.error ?? 'Finding not found'}</Alert>;
  const canReject = canVerify && f.allowed_transitions.includes('REJECTED');
  const canConfirm = canVerify && f.allowed_transitions.includes('CONFIRMED');

  return (
    <article aria-labelledby="preview-title" className="border-t-2 border-black">
      <div className="flex flex-wrap items-center gap-2 pt-4">
        <FindingStatusBadge status={f.status} />
        {f.source === 'AI' && f.status === 'PENDING' ? <AiUnverifiedBadge /> : <SourceBadge source={f.source} />}
        <SeverityBadge severity={f.final_severity ?? f.ai_severity} prefix={f.final_severity ? 'Final' : 'Suggested'} />
      </div>
      <h2 id="preview-title" className="mt-3 font-display text-2xl leading-tight font-extrabold text-black sm:text-3xl">
        {f.title}
      </h2>
      <p className="mt-2 text-sm break-all text-ink-600">{f.affected_asset}</p>

      {(canConfirm || canReject) && (
        <div className="mt-5 flex flex-wrap gap-2 border-y border-ink-200 py-3">
          {canConfirm && (
            <Link href={`/findings/${f.id}#verify`} className="inline-flex h-9 items-center gap-2 bg-black px-4 text-sm font-semibold text-white hover:bg-ink-700">
              Review & confirm
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
          {canReject && (
            <>
              <Button variant="secondary" onClick={() => setDecision('FALSE_POSITIVE')}>
                False positive
              </Button>
              <Button variant="danger" onClick={() => setDecision('REJECTED')}>
                Reject
              </Button>
            </>
          )}
        </div>
      )}

      <div className="mt-5">
        <DetailList
          items={[
            ['Target', f.target?.name ?? '-'],
            ['Category', CATEGORY_LABEL[f.category]],
            [
              f.cvss_score !== null ? 'CVSS v3.1' : 'CVSS v3.1 (suggested)',
              f.cvss_score !== null || f.suggested_cvss_score !== null ? (
                <span key="cvss">
                  <span className="font-bold tabular-nums text-black">{(f.cvss_score ?? f.suggested_cvss_score ?? 0).toFixed(1)}</span>
                  <span className="block font-mono text-[11px] break-all text-ink-500">{f.cvss_vector ?? f.suggested_cvss_vector}</span>
                </span>
              ) : (
                'Not scored (informational)'
              ),
            ],
            ['CVE', <CveList key="cve" ids={f.cve_ids} compact />],
            ['OWASP Top 10 / WSTG', [f.owasp_top10, f.wstg_id].filter(Boolean).join(' / ') || '-'],
            ['Evidence', `${f.evidence.length} item${f.evidence.length === 1 ? '' : 's'}`],
            ['From scan', f.scan ? `${f.scan.tool.replace('_', ' ')}, ${formatDateTime(f.scan.created_at)}` : 'Manual'],
            ['Raised', formatDateTime(f.created_at)],
          ]}
        />
      </div>

      <h3 className="mt-6 border-b border-black pb-1 text-sm font-bold text-black">What was found</h3>
      <p className="mt-3 max-w-prose text-sm leading-relaxed whitespace-pre-line text-ink-800">{f.description}</p>

      {(f.remediation || f.suggested_remediation) && (
        <>
          <h3 className="mt-6 border-b border-black pb-1 text-sm font-bold text-black">{f.remediation ? 'Remediation' : 'Suggested fix'}</h3>
          <p className="mt-3 max-w-prose text-sm leading-relaxed whitespace-pre-line text-ink-800">{f.remediation ?? f.suggested_remediation}</p>
          {!f.remediation && <p className="mt-1 text-xs text-ink-500">Not accepted yet. Accept or edit it on the finding page.</p>}
        </>
      )}

      {f.verification_logs.length > 0 && (
        <>
          <h3 className="mt-6 border-b border-black pb-1 text-sm font-bold text-black">Decisions</h3>
          <ol className="mt-2">
            {f.verification_logs.map((log) => (
              <li key={log.id} className="border-b border-ink-200 py-2 text-sm">
                <span className="font-bold text-black">{log.new_status.replace('_', ' ').toLowerCase()}</span>
                <span className="text-ink-500">
                  {' '}
                  by {log.assessor?.name ?? 'a deleted user'}, {formatDate(log.created_at)}
                </span>
                <p className="mt-0.5 text-ink-700">{log.notes}</p>
              </li>
            ))}
          </ol>
        </>
      )}

      <Link href={`/findings/${f.id}`} className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-black underline underline-offset-4">
        Open the full finding: evidence, remediation, history
      </Link>

      <DecisionDialog
        findingId={f.id}
        title={f.title}
        decision={decision}
        onClose={() => setDecision(null)}
        onDone={() => {
          const verb = decision === 'FALSE_POSITIVE' ? 'Marked false positive' : 'Rejected';
          setDecision(null);
          onDecided(verb);
        }}
      />
    </article>
  );
}

function FindingsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { can } = useAuth();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const filters = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? ''])) as Record<(typeof FILTERS)[number], string>;
  const page = Number(params.get('page') ?? 1) || 1;
  const targets = useApi<Target[]>('/targets');
  const findings = useApi<Finding[]>('/findings', { ...filters, page, limit: 25 });
  useReloadOn(PENDING_CHANGED_EVENT, findings.reload);
  const [search, setSearch] = useState(filters.q);
  const [selected, setSelected] = useState<string | null>(params.get('focus'));
  const canVerify = can('ADMIN', 'ASSESSOR');

  const setParam = useCallback(
    (key: string, value: string | number) => {
      const next = new URLSearchParams(params.toString());
      if (value === '' || value === 1) next.delete(key);
      else next.set(key, String(value));
      if (key !== 'page') next.delete('page');
      next.delete('focus');
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  // Debounce typing into the URL (?q=), which drives the request.
  useEffect(() => {
    if (search.trim() === filters.q) return;
    const timer = setTimeout(() => setParam('q', search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search, filters.q, setParam]);

  const rows = useMemo(() => findings.data ?? [], [findings.data]);
  // Keep a valid selection: the focused one if it's on this page, otherwise the first row.
  useEffect(() => {
    if (rows.length === 0) return;
    if (!selected || !rows.some((r) => r.id === selected)) setSelected(rows[0]?.id ?? null);
  }, [rows, selected]);

  const move = useCallback(
    (delta: number) => {
      const i = rows.findIndex((r) => r.id === selected);
      const next = rows[Math.min(rows.length - 1, Math.max(0, i + delta))];
      if (next) {
        setSelected(next.id);
        document.getElementById(`row-${next.id}`)?.scrollIntoView({ block: 'nearest' });
      }
    },
    [rows, selected],
  );

  // j/k move through the queue from anywhere on the page (not while typing or inside a dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.closest('dialog')) return;
      if (e.key === 'j') move(1);
      else if (e.key === 'k') move(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [move]);

  const filterSelect = (key: (typeof FILTERS)[number], label: string, options: Array<[string, string]>) => (
    <div className="min-w-0">
      <Label htmlFor={`f-${key}`} className="sr-only">
        {label}
      </Label>
      <Select id={`f-${key}`} value={filters[key]} onChange={(e) => setParam(key, e.target.value)}>
        <option value="">{`Any ${label.toLowerCase()}`}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    </div>
  );

  const selectedIndex = rows.findIndex((r) => r.id === selected);

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every scan adds findings here by itself, from tool rules and the AI. Work the queue: a finding counts only after an assessor decides."
        actions={
          canVerify && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add manual finding
            </Button>
          )
        }
      />

      <Tabs label="Finding status" value={filters.status} onChange={(v) => setParam('status', v)} tabs={STATUS_TABS.map((t) => ({ value: t.value, label: t.label, attention: t.value === 'PENDING' }))} />

      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput label="Search findings" placeholder="Search title, asset or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        {filterSelect('target_id', 'Target', (targets.data ?? []).map((t) => [t.id, t.name]))}
        {filterSelect('category', 'Category', FINDING_CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]]))}
        {filterSelect('source', 'Source', FINDING_SOURCES.map((s) => [s, SOURCE_LABEL[s]]))}
      </div>

      {findings.error && <Alert kind="error">{findings.error}</Alert>}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <section aria-label="Queue" className="min-w-0 lg:col-span-5">
          <div className="flex items-baseline justify-between border-b-2 border-black pb-2">
            <p className="text-sm font-bold text-black">{findings.meta ? `${findings.meta.total} finding${findings.meta.total === 1 ? '' : 's'}` : 'Loading'}</p>
            <p className="hidden text-xs text-ink-500 lg:block">
              <kbd className="border border-ink-300 px-1 font-sans">j</kbd> <kbd className="border border-ink-300 px-1 font-sans">k</kbd> or arrow keys to move
            </p>
          </div>
          {findings.loading && !findings.data && <SkeletonRows rows={6} label="Loading findings" />}
          {findings.data?.length === 0 && (
            <Empty title={filters.q ? `No findings match "${filters.q}"` : filters.status === 'PENDING' ? 'Nothing waiting for verification' : 'No findings match these filters'}>
              {filters.q ? 'Try fewer words, or clear the other filters.' : 'Run a full assessment from a target page; its scans turn into findings here.'}
            </Empty>
          )}

          {/* Small and medium screens: a plain list; each row opens the finding page. */}
          {rows.length > 0 && (
            <ul className="lg:hidden">
              {rows.map((f) => (
                <li key={f.id}>
                  <Link href={`/findings/${f.id}`} className={rowClass(false)}>
                    <RowBody f={f} selected={false} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Large screens: a listbox that selects into the preview pane. */}
          {rows.length > 0 && (
            <ul
              role="listbox"
              aria-label="Findings"
              aria-activedescendant={selected ? `row-${selected}` : undefined}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(-1);
                } else if (e.key === 'Enter' && selected) {
                  router.push(`/findings/${selected}`);
                }
              }}
              className="hidden outline-none focus-visible:ring-2 focus-visible:ring-black lg:block"
            >
              {rows.map((f) => (
                <li key={f.id} id={`row-${f.id}`} role="option" aria-selected={f.id === selected} onClick={() => setSelected(f.id)} className={cn(rowClass(f.id === selected), 'cursor-pointer')}>
                  <RowBody f={f} selected={f.id === selected} />
                </li>
              ))}
            </ul>
          )}
          <Pagination meta={findings.meta} onPage={(p) => setParam('page', p)} />
        </section>

        <section aria-label="Selected finding" className="hidden min-w-0 lg:col-span-7 lg:block">
          <div className="sticky top-[calc(var(--spacing-topbar)+1.5rem)]">
            {selected && selectedIndex >= 0 && (
              <>
                <p className="mb-2 text-xs tabular-nums text-ink-500">
                  {selectedIndex + 1} of {rows.length} on this page
                </p>
                <Preview
                  key={selected}
                  id={selected}
                  canVerify={canVerify}
                  onDecided={(verb) => {
                    toast({ title: verb, body: rows[selectedIndex]?.title ?? '' });
                    const next = rows[selectedIndex + 1] ?? rows[selectedIndex - 1];
                    setSelected(next?.id ?? null);
                    void findings.reload();
                  }}
                />
              </>
            )}
          </div>
        </section>
      </div>

      {targets.data && (
        <Dialog open={adding} onClose={() => setAdding(false)} size="lg" title="Record a manual finding" description="For hand tests, such as an IDOR found with two test accounts. It starts as To verify.">
          <ManualFindingForm targets={targets.data} defaultTargetId={filters.target_id} onCreated={(id) => router.push(`/findings/${id}`)} />
        </Dialog>
      )}
    </>
  );
}

export default function FindingsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <FindingsView />
    </Suspense>
  );
}
