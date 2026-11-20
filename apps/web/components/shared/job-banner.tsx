'use client';

import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/feedback';
import { useJob } from '@/hooks/useJob';
import { humanize } from '@/lib/utils';
import type { Job } from '@/types/api';

/** Shows a queued job's progress until it finishes, then hands the final job to onDone. */
export function JobBanner({ jobId, label, onDone }: { jobId: string | null; label: string; onDone?: (job: Job) => void }) {
  const { job, error, running } = useJob(jobId, onDone);
  if (!jobId) return null;
  if (error) return <Alert kind="error">{label}: {error}</Alert>;
  if (running) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {label}: {job ? humanize(job.status) : 'Queued'}…
      </div>
    );
  }
  if (job?.status === 'FAILED') return <Alert kind="error">{label} failed: {job.failed_reason ?? 'unknown error'}</Alert>;
  return <Alert kind="success">{label} finished.</Alert>;
}
