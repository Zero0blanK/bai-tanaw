'use client';

import { cloneElement, useId, useState, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * A short hint shown on hover and on keyboard focus, linked with aria-describedby so screen readers read it too.
 * The child must be focusable (a button or link). Use for labels of icon-only controls and brief explanations.
 */
export function Tooltip({ content, children, side = 'top' }: { content: string; children: ReactElement<Record<string, unknown>>; side?: 'top' | 'right' | 'bottom' }) {
  const [show, setShow] = useState(false);
  const id = useId();
  const trigger = cloneElement(children, { 'aria-describedby': show ? id : undefined });
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setShow(true)}
      onPointerLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setShow(false);
      }}
    >
      {trigger}
      {show && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute z-50 w-max max-w-64 rounded-none bg-ink-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-white shadow-[var(--shadow-overlay)]',
            side === 'top' && 'bottom-full left-1/2 mb-2 -translate-x-1/2',
            side === 'bottom' && 'top-full left-1/2 mt-2 -translate-x-1/2',
            side === 'right' && 'top-1/2 left-full ml-3 -translate-y-1/2',
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
