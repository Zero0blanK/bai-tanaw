'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type MenuItem =
  | { kind: 'link'; label: string; href: string; icon?: ReactNode }
  | { kind: 'action'; label: string; onSelect: () => void; icon?: ReactNode; tone?: 'danger' }
  | { kind: 'separator' };

/**
 * Dropdown menu (WAI-ARIA menu button pattern): Enter/Space/ArrowDown opens it, arrows move between items,
 * Escape closes and returns focus to the trigger, a click outside closes it.
 */
export function Menu({
  trigger,
  label,
  items,
  align = 'end',
  header,
  triggerClassName,
  placement = 'below',
}: {
  trigger: ReactNode;
  label: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  header?: ReactNode;
  triggerClassName?: string;
  placement?: 'below' | 'above';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const focusables = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    focusables()[0]?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const list = focusables();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      close(false);
    }
  }

  const itemClass = (danger?: boolean) =>
    cn(
      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors',
      danger ? 'text-red-700 hover:bg-red-50 focus:bg-red-50' : 'text-ink-700 hover:bg-ink-100 focus:bg-ink-100 focus:text-ink-900',
    );

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute z-40 min-w-56 rounded-[var(--radius-surface)] border border-ink-200 bg-white p-1.5 shadow-[var(--shadow-overlay)]',
            align === 'end' ? 'right-0' : 'left-0',
            placement === 'below' ? 'top-full mt-2' : 'bottom-full mb-2',
          )}
        >
          {header && <div className="border-b border-ink-100 px-2.5 pt-1.5 pb-2.5 mb-1.5">{header}</div>}
          {items.map((item, i) =>
            item.kind === 'separator' ? (
              <div key={`sep-${i}`} role="separator" className="my-1.5 h-px bg-ink-100" />
            ) : item.kind === 'link' ? (
              <Link key={item.label} href={item.href} role="menuitem" tabIndex={-1} className={itemClass()} onClick={() => close(false)}>
                {item.icon}
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass(item.tone === 'danger')}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
