'use client';

import type { Severity } from '@tanaw/shared';
import { Bug, Search, Target as TargetIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Finding, Target } from '@/types/api';
import { SEVERITY_COLOR } from './badges';

interface Result {
  id: string;
  kind: 'target' | 'finding' | 'all';
  label: string;
  detail: string;
  href: string;
  severity?: Severity | null;
}

const DEBOUNCE_MS = 250;

/**
 * Searches targets (by name or URL) and findings (title, asset, description through GET /findings?q=).
 * WAI-ARIA combobox: arrows move through results, Enter opens one, Escape closes. "/" focuses it from anywhere.
 */
export function GlobalSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const q = query.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || targets) return;
    void api<Target[]>('/targets')
      .then((r) => setTargets(r.data))
      .catch(() => setTargets([]));
  }, [open, targets]);

  useEffect(() => {
    if (q.length < 2) {
      setFindings([]);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<Finding[]>('/findings', { query: { q, limit: 6 } })
        .then((r) => !cancelled && setFindings(r.data))
        .catch(() => !cancelled && setFindings([]))
        .finally(() => !cancelled && setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const results = useMemo<Result[]>(() => {
    if (q.length < 2) return [];
    const needle = q.toLowerCase();
    const t = (targets ?? [])
      .filter((x) => x.name.toLowerCase().includes(needle) || x.base_url.toLowerCase().includes(needle))
      .slice(0, 4)
      .map<Result>((x) => ({ id: x.id, kind: 'target', label: x.name, detail: x.base_url, href: `/targets/${x.id}` }));
    const f = findings.map<Result>((x) => ({
      id: x.id,
      kind: 'finding',
      label: x.title,
      detail: x.target?.name ?? x.affected_asset,
      href: `/findings/${x.id}`,
      severity: x.final_severity ?? x.ai_severity,
    }));
    return [...t, ...f, { id: 'all', kind: 'all', label: `Search all findings for "${q}"`, detail: '', href: `/findings?q=${encodeURIComponent(q)}` }];
  }, [q, targets, findings]);

  useEffect(() => setActive(0), [q]);

  function go(r: Result | undefined) {
    if (!r) return;
    setOpen(false);
    setQuery('');
    input.current?.blur();
    router.push(r.href);
  }

  const showList = open && q.length >= 2;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search targets and findings"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? optionId(active) : undefined}
        placeholder="Search targets and findings"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            go(results[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            input.current?.blur();
          }
        }}
        className="h-9 w-full rounded-[var(--radius-control)] border border-ink-200 bg-ink-50 pr-10 pl-9 text-sm text-ink-900 placeholder:text-ink-400 transition-colors hover:border-ink-300 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-brand-100"
      />
      {!query && (
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-none border border-ink-200 bg-white px-1.5 text-[11px] font-semibold text-ink-400 sm:block" aria-hidden>
          /
        </kbd>
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute top-full right-0 left-0 z-40 mt-2 max-h-96 overflow-y-auto rounded-[var(--radius-surface)] border border-ink-200 bg-white p-1.5 shadow-[var(--shadow-overlay)]"
        >
          {loading && findings.length === 0 && <li className="px-3 py-2 text-sm text-ink-500">Searching…</li>}
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.id}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-none px-3 py-2 text-sm',
                i === active ? 'bg-ink-100 text-ink-900' : 'text-ink-700',
                r.kind === 'all' && 'mt-1 border-t border-ink-100 font-semibold text-brand-700',
              )}
            >
              {r.kind === 'target' && <TargetIcon className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
              {r.kind === 'finding' && (
                <span className="relative">
                  <Bug className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                  {r.severity && <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-white" style={{ backgroundColor: SEVERITY_COLOR[r.severity] }} aria-hidden />}
                </span>
              )}
              {r.kind === 'all' && <Search className="h-4 w-4 shrink-0" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.label}</span>
                {r.detail && <span className="block truncate text-xs text-ink-500">{r.detail}</span>}
              </span>
              {r.kind !== 'all' && <span className="shrink-0 text-xs text-ink-400">{r.kind === 'target' ? 'Target' : 'Finding'}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
