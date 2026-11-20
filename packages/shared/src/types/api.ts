/** Every API response uses this envelope. */
export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data: T;
  errors?: Array<{ path: string; message: string }>;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/** Payload carried by every BullMQ job. The job row in Postgres holds the rest. */
export interface QueueJobData {
  jobId: string;
}
