'use client';

import type { JobStatus, ScanStatus } from '@tanaw/shared';
import { Check, Loader2, Minus, Radar, ShieldCheck, Sparkles, TriangleAlert, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';

interface AssessmentScan {
  id: string;
  tool: 'HTTP_CHECK' | 'DNS' | 'OPENAPI' | 'NMAP' | 'ZAP';
  status: ScanStatus;
  error: string | null;
  results: number;
  findings: number;
}

interface AssessmentAi {
  id: string;
  scan_id: string;
  status: JobStatus;
  failed_reason: string | null;
  result: { findings_created?: number } | null;
}

export interface Assessment {
  batch_id: string | null;
  started_at: string | null;
  scans: AssessmentScan[];
  ai: AssessmentAi[];
  findings: Record<string, number>;
}

type StepState = 'idle' | 'waiting' | 'running' | 'done' | 'failed' | 'skipped';

interface Step {
  key: string;
  label: string;
  detail: string;
  state: StepState;
  href?: string;
}

const TOOL_STEPS: Array<{ tool: AssessmentScan['tool']; label: string; what: string }> = [
  { tool: 'HTTP_CHECK', label: 'HTTP check', what: 'headers, cookies, CORS, HTTPS' },
  { tool: 'DNS', label: 'DNS', what: 'records' },
  { tool: 'OPENAPI', label: 'OpenAPI', what: 'endpoints' },
  { tool: 'NMAP', label: 'Nmap', what: 'ports and services' },
  { tool: 'ZAP', label: 'ZAP', what: 'spider and passive scan' },
];

function scanState(s: AssessmentScan | undefined, batch: boolean): StepState {
  if (!s) return batch ? 'skipped' : 'idle';
  if (s.status === 'QUEUED') return 'waiting';
  if (s.status === 'RUNNING') return 'running';
  if (s.status === 'FAILED') return 'failed';
  return 'done';
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Builds the track: scope, each tool, the AI, then the assessor. It is a real sequence, so it is numbered by position. */
function buildSteps(a: Assessment | undefined, targetId: string, scopeRules: number): Step[] {
  const batch = Boolean(a?.batch_id);
  const steps: Step[] = [
    { key: 'scope', label: 'Scope', detail: scopeRules > 0 ? `${plural(scopeRules, 'rule')} enforced` : 'Target host only', state: 'done' },
  ];
  for (const t of TOOL_STEPS) {
    const s = a?.scans.find((x) => x.tool === t.tool);
    const state = scanState(s, batch);
    const detail = !batch
      ? t.what
      : state === 'skipped'
        ? 'Skipped (out of scope)'
        : state === 'failed'
          ? (s?.error ?? 'Failed').slice(0, 60)
          : state === 'done'
            ? `${plural(s?.results ?? 0, 'result')}, ${plural(s?.findings ?? 0, 'finding')}`
            : state === 'running'
              ? 'Running'
              : 'Queued';
    steps.push({ key: t.tool, label: t.label, detail, state, ...(s ? { href: `/scans/${s.id}` } : {}) });
  }

  const ai = a?.ai ?? [];
  const toolsBusy = (a?.scans ?? []).some((s) => s.status === 'QUEUED' || s.status === 'RUNNING');
  const aiBusy = ai.some((j) => j.status === 'WAITING' || j.status === 'ACTIVE');
  const aiDone = ai.filter((j) => j.status === 'COMPLETED');
  const aiFound = aiDone.reduce((n, j) => n + (j.result?.findings_created ?? 0), 0);
  const aiFailed = ai.filter((j) => j.status === 'FAILED');
  let aiState: StepState = 'idle';
  let aiDetail = 'Reads every finished scan';
  if (batch) {
    if (aiBusy) [aiState, aiDetail] = ['running', `Reading ${plural(ai.length - aiDone.length - aiFailed.length, 'scan')}`];
    else if (ai.length === 0) [aiState, aiDetail] = toolsBusy ? ['waiting', 'Starts as scans finish'] : ['skipped', 'Not run: add an API key in Settings'];
    else if (aiFailed.length === ai.length) [aiState, aiDetail] = ['failed', (aiFailed[0]?.failed_reason ?? 'Failed').slice(0, 60)];
    else [aiState, aiDetail] = [toolsBusy ? 'running' : 'done', `${plural(aiFound, 'new finding')}`];
  }
  steps.push({ key: 'ai', label: 'AI analysis', detail: aiDetail, state: aiState });

  const pending = a?.findings.PENDING ?? 0;
  steps.push({
    key: 'verify',
    label: 'Your review',
    detail: pending > 0 ? `${plural(pending, 'finding')} to verify` : 'Nothing waiting',
    state: pending > 0 ? 'waiting' : batch && !toolsBusy && !aiBusy ? 'done' : 'idle',
    href: `/findings?target_id=${targetId}&status=PENDING`,
  });
  return steps;
}

function StepDot({ state, index }: { state: StepState; index: number }) {
  const base = 'relative z-10 grid h-8 w-8 shrink-0 place-items-center text-xs font-bold ring-4 ring-white';
  switch (state) {
    case 'done':
      return (
        <span className={cn(base, 'bg-brand-600 text-white')}>
          <Check className="h-4 w-4" aria-hidden />
        </span>
      );
    case 'running':
      return (
        <span className={cn(base, 'track-active bg-white text-black outline-2 outline-black')}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        </span>
      );
    case 'failed':
      return (
        <span className={cn(base, 'bg-signal text-white')}>
          <TriangleAlert className="h-4 w-4" aria-hidden />
        </span>
      );
    case 'skipped':
      return (
        <span className={cn(base, 'bg-ink-100 text-ink-400 outline outline-dashed outline-ink-300')}>
          <Minus className="h-4 w-4" aria-hidden />
        </span>
      );
    case 'waiting':
      return <span className={cn(base, 'bg-amber-400 text-black')}>{index}</span>;
    default:
      return <span className={cn(base, 'bg-ink-100 text-ink-500')}>{index}</span>;
  }
}

const STATE_LABEL: Record<StepState, string> = {
  idle: 'not started',
  waiting: 'waiting',
  running: 'in progress',
  done: 'done',
  failed: 'failed',
  skipped: 'skipped',
};

function Track({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4 lg:grid-cols-8" aria-label="Assessment steps">
      {steps.map((step, i) => {
        const connectorDone = step.state === 'done';
        const content = (
          <>
            <div className="flex items-center">
              <StepDot state={step.state} index={i + 1} />
              {i < steps.length - 1 && (
                <span aria-hidden className={cn('hidden h-[3px] flex-1 lg:block', connectorDone ? 'bg-black' : 'bg-ink-200')} />
              )}
            </div>
            <p className={cn('mt-2.5 text-sm font-bold', step.state === 'idle' ? 'text-ink-500' : 'text-black')}>{step.label}</p>
            <p className={cn('mt-0.5 text-xs leading-snug', step.state === 'failed' ? 'font-semibold text-signal' : step.key === 'verify' && step.state === 'waiting' ? 'font-bold text-amber-700' : 'text-ink-500')}>
              {step.detail}
            </p>
            <span className="sr-only">({STATE_LABEL[step.state]})</span>
          </>
        );
        return (
          <li key={step.key} className="min-w-0">
            {step.href ? (
              <Link href={step.href} className="block hover:[&_p:first-of-type]:underline hover:[&_p:first-of-type]:underline-offset-4">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function AssessmentPanel({ targetId, baseUrl, scopeRules, canRun, onChange }: { targetId: string; baseUrl: string; scopeRules: number; canRun: boolean; onChange: () => void }) {
  const assessment = useApi<Assessment>(`/targets/${targetId}/assessment`);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const a = assessment.data;
  const busy =
    Boolean(a?.scans.some((s) => s.status === 'QUEUED' || s.status === 'RUNNING')) ||
    Boolean(a?.ai.some((j) => j.status === 'WAITING' || j.status === 'ACTIVE'));

  // Poll while anything in the run is still moving; refresh the rest of the page each time.
  const { reload } = assessment;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      void reload();
      onChange();
    }, 3000);
    return () => clearInterval(timer);
  }, [busy, reload, onChange]);

  async function run() {
    setStarting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ runs: unknown[]; skipped: Array<{ tool: string; reason: string }> }>(`/targets/${targetId}/scans/all`, { method: 'POST', body: {} });
      if (res.data.skipped.length > 0) setNotice(`Skipped ${res.data.skipped.map((s) => s.tool.replace('_', ' ')).join(', ')}: outside the scope rules.`);
      await reload();
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  }

  const steps = buildSteps(a, targetId, scopeRules);

  return (
    <section className="relative border-2 border-black bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black px-5 pt-4 pb-4">
        <div className="max-w-xl">
          <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold text-black">
            <Radar className="h-6 w-6 text-black" aria-hidden />
            Assessment
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
            Runs every tool against <span className="font-bold text-black">{baseUrl}</span> within its scope. Each finished scan becomes
            findings automatically, and the AI reads it for anything the rules miss. Nothing is confirmed until you verify it.
          </p>
          {a?.started_at && <p className="mt-2 text-xs text-ink-500">Last run started {formatDateTime(a.started_at)}</p>}
        </div>
        {canRun && (
          <Button size="lg" onClick={() => void run()} loading={starting} disabled={busy}>
            {!starting && <ShieldCheck className="h-[18px] w-[18px]" aria-hidden />}
            {busy ? 'Assessment running' : a?.batch_id ? 'Run again' : 'Run full assessment'}
          </Button>
        )}
      </div>
      <div className="px-5 py-4">
        {assessment.error ? <Alert kind="error">{assessment.error}</Alert> : <Track steps={steps} />}
        {(error || notice) && (
          <div className="mt-5 space-y-2">
            {error && <Alert kind="error">{error}</Alert>}
            {notice && <Alert kind="info">{notice}</Alert>}
          </div>
        )}
        {a && !a.batch_id && !canRun && <p className="mt-4 text-sm text-ink-500">No assessment has been run on this target yet.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-ink-200 px-5 py-2 text-xs text-ink-600">
        <span className="flex items-center gap-1.5">
          <UserCheck className="h-3.5 w-3.5" aria-hidden />
          Tools and AI only suggest. An assessor confirms.
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Secrets are removed before anything reaches the AI.
        </span>
      </div>
    </section>
  );
}
