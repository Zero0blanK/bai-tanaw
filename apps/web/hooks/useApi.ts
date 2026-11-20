'use client';

import type { PaginationMeta } from '@tanaw/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, type RequestOptions } from '@/lib/api';

export interface ApiState<T> {
  data: T | undefined;
  meta: PaginationMeta | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** GETs `path` (skips when null) and re-fetches when path or query change. */
export function useApi<T>(path: string | null, query?: RequestOptions['query']): ApiState<T> {
  const [data, setData] = useState<T>();
  const [meta, setMeta] = useState<PaginationMeta>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const queryKey = JSON.stringify(query ?? {});
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await api<T>(path, { query: JSON.parse(queryKey) as NonNullable<RequestOptions['query']> });
      if (id !== latest.current) return;
      setData(res.data);
      setMeta(res.meta);
      setError(null);
    } catch (e) {
      if (id === latest.current) setError(errorMessage(e));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [path, queryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, meta, error, loading, reload: load };
}
