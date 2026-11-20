'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { Job } from '@/types/api';

const POLL_MS = 2_000;

/** Polls GET /jobs/:id every 2s until COMPLETED or FAILED, then calls onDone once (AGENT.md §10). */
export function useJob(jobId: string | null, onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const { data } = await api<Job>(`/jobs/${jobId}`);
        if (stopped) return;
        setJob(data);
        setError(null);
        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          done.current?.(data);
          return;
        }
      } catch (e) {
        if (!stopped) setError(errorMessage(e));
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  const running = Boolean(jobId) && (!job || job.status === 'WAITING' || job.status === 'ACTIVE');
  return { job, error, running };
}
