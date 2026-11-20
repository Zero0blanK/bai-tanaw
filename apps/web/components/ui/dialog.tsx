'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Modal dialog on the native <dialog> element: the browser traps focus, makes the page behind inert and closes on
 * Escape. Focus returns to whatever opened it. Mark the control that should get focus first with `data-autofocus`.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  role = 'dialog',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  role?: 'dialog' | 'alertdialog';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // showModal focuses the first focusable element (the close button); prefer the one the caller marked.
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself, outside the panel) closes it.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-[var(--radius-overlay)] bg-white p-0 text-ink-900 shadow-[var(--shadow-overlay)] backdrop:bg-ink-950/45',
        size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg',
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1.5 text-sm leading-relaxed text-ink-600">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-control)] text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-800"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-6 pt-4">{children}</div>}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/60 px-6 py-4">{footer}</div>}
          {!footer && <div className="pb-6" />}
        </div>
      )}
    </dialog>
  );
}
