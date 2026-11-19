import type { ApiResponse, PaginationMeta } from '@tanaw/shared';
import type { Response } from 'express';

export function ok<T>(res: Response, data: T, message?: string, meta?: PaginationMeta): Response {
  const body: ApiResponse<T> = { success: true, data, ...(message ? { message } : {}), ...(meta ? { meta } : {}) };
  return res.status(200).json(body);
}

export function created<T>(res: Response, data: T, message?: string): Response {
  const body: ApiResponse<T> = { success: true, data, ...(message ? { message } : {}) };
  return res.status(201).json(body);
}

/** For queued work: the client polls GET /api/jobs/:id. */
export function accepted<T>(res: Response, data: T, message = 'Queued'): Response {
  const body: ApiResponse<T> = { success: true, data, message };
  return res.status(202).json(body);
}

export function paginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, total_pages: Math.max(1, Math.ceil(total / limit)) };
}
