'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button } from './button';
import { Dialog } from './dialog';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  /** Names the action, e.g. "Delete user". Never "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** `const confirm = useConfirm(); if (await confirm({...})) …` replaces window.confirm with an accessible dialog. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (next) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => settle(false)}
        role="alertdialog"
        size="sm"
        title={options?.title ?? ''}
        description={options?.body}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)} data-autofocus={options?.tone === 'danger' ? '' : undefined}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={options?.tone === 'danger' ? 'destructive' : 'primary'} onClick={() => settle(true)} data-autofocus={options?.tone !== 'danger' ? '' : undefined}>
              {options?.confirmLabel}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
