'use client';

import { useEffect } from 'react';

/** Calls `reload` whenever `eventName` fires on window (e.g. PENDING_CHANGED_EVENT from the app shell). */
export function useReloadOn(eventName: string, reload: () => unknown) {
  useEffect(() => {
    const handler = () => void reload();
    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [eventName, reload]);
}
