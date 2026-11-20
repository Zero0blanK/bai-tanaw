'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  value: string;
  label: string;
  /** Shown after the label; omitted when undefined. */
  count?: number | undefined;
  /** Draws the label in the "needs attention" colour when the tab isn't selected. */
  attention?: boolean;
}

/**
 * Tab list (WAI-ARIA tabs): Left/Right/Home/End move between tabs and select them. The caller renders the panel.
 */
export function Tabs({ tabs, value, onChange, label, className }: { tabs: TabItem[]; value: string; onChange: (value: string) => void; label: string; className?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function move(index: number) {
    const next = (index + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next]?.value ?? value);
  }

  return (
    <div role="tablist" aria-label={label} className={cn('mb-5 flex gap-1 overflow-x-auto border-b border-ink-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      {tabs.map((tab, i) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value || '_all'}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(i + 1);
              else if (e.key === 'ArrowLeft') move(i - 1);
              else if (e.key === 'Home') move(0);
              else if (e.key === 'End') move(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={cn(
              '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 text-sm font-semibold transition-colors duration-[var(--duration-fast)]',
              selected ? 'border-brand-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-800',
              !selected && tab.attention && 'text-amber-700',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', selected ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500')}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
