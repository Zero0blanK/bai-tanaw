'use client';

import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string | undefined;
}

type Toast = (toast: { kind?: ToastKind; title: string; body?: string }) => void;

const ToastContext = createContext<Toast | null>(null);

const STYLE: Record<ToastKind, { Icon: typeof Info; icon: string }> = {
  success: { Icon: CheckCircle2, icon: 'text-brand-600' },
  error: { Icon: AlertTriangle, icon: 'text-red-600' },
  info: { Icon: Info, icon: 'text-ink-500' },
};

/** Errors stay until dismissed; everything else leaves after a few seconds. */
const DURATION_MS = 5000;

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const { Icon, icon } = STYLE[item.kind];
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (item.kind === 'error') return;
    const timer = setTimeout(() => dismiss.current(), DURATION_MS);
    return () => clearTimeout(timer);
  }, [item.kind]);

  return (
    <li
      role={item.kind === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-full gap-3 rounded-[var(--radius-surface)] border border-ink-200 bg-white px-4 py-3 shadow-[var(--shadow-overlay)]"
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{item.title}</p>
        {item.body && <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{item.body}</p>}
      </div>
      <button type="button" onClick={onDismiss} className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Dismiss notification">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

/** Feedback after an action ("Target registered"). Inline alerts stay for errors tied to a form. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);

  const toast = useCallback<Toast>(({ kind = 'success', title, body }) => {
    next.current += 1;
    const id = next.current;
    setItems((list) => [...list.slice(-3), { id, kind, title, body }]);
  }, []);

  const dismiss = (id: number) => setItems((list) => list.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ol
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96 print:hidden"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}

export function useToast(): Toast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
