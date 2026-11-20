'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

/** Lets a detail page put its own name at the end of the top-bar breadcrumb ("Targets › Bayaw Jobs"). */
interface ShellContextValue {
  setDetail: (label: string | null) => void;
}

const ShellContext = createContext<ShellContextValue>({ setDetail: () => undefined });

export function ShellProvider({ value, children }: { value: ShellContextValue; children: ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** Call from a detail page with its title; cleared when the page unmounts. */
export function useBreadcrumbDetail(label: string | null) {
  const { setDetail } = useContext(ShellContext);
  useEffect(() => {
    setDetail(label);
    return () => setDetail(null);
  }, [label, setDetail]);
}
