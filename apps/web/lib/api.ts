// API client. The access token lives in memory only (never localStorage); the refresh token is an httpOnly
// cookie the browser sends to /api/auth. On a 401 we refresh once (shared by concurrent requests) and retry.

import type { ApiResponse, PaginationMeta } from '@tanaw/shared';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshing: Promise<Session<unknown> | null> | null = null;
let onSessionLost: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Called when a refresh fails, so the app can send the user to /login. */
export function setSessionLostHandler(handler: (() => void) | null): void {
  onSessionLost = handler;
}

export interface Session<U> {
  access_token: string;
  user: U;
}

/** Exchanges the refresh cookie for a new access token. Single-flight. */
export function refreshSession<U>(): Promise<Session<U> | null> {
  const run = async (): Promise<Session<unknown> | null> => {
    const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' }).catch(() => null);
    if (!res?.ok) {
      accessToken = null;
      return null;
    }
    const body = (await res.json()) as ApiResponse<Session<unknown>>;
    accessToken = body.data.access_token;
    return body.data;
  };
  refreshing ??= run().finally(() => {
    refreshing = null;
  });
  return refreshing as Promise<Session<U> | null>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  return url.toString();
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  let body: BodyInit | null = null;
  if (options.form) body = options.form;
  else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  return fetch(buildUrl(path, options.query), { method: options.method ?? 'GET', headers, body, credentials: 'include' });
}

async function sendWithRefresh(path: string, options: RequestOptions): Promise<Response> {
  let res = await send(path, options);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (!session) {
      onSessionLost?.();
      return res;
    }
    res = await send(path, options);
  }
  return res;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiResponse<null>;
    return new ApiError(res.status, body.message ?? `Request failed (${res.status})`, body.errors);
  } catch {
    return new ApiError(res.status, `Request failed (${res.status})`);
  }
}

/** JSON request; returns `data` (and `meta` for paginated lists). Throws ApiError. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta?: PaginationMeta; message?: string }> {
  const res = await sendWithRefresh(path, options);
  if (!res.ok) throw await toError(res);
  const body = (await res.json()) as ApiResponse<T>;
  return { data: body.data, ...(body.meta ? { meta: body.meta } : {}), ...(body.message ? { message: body.message } : {}) };
}

/** Authenticated binary fetch (raw scan output, evidence files). */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await sendWithRefresh(path, {});
  if (!res.ok) throw await toError(res);
  return res.blob();
}

/** Downloads an authenticated file through a temporary object URL. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Human message for any thrown value, including validation details. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.errors?.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ');
    return details ? `${error.message} (${details})` : error.message;
  }
  if (error instanceof TypeError) return 'Cannot reach the Tanaw API. Is it running?';
  return error instanceof Error ? error.message : 'Something went wrong';
}
