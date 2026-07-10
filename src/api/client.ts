import type { ProblemEnvelope } from './types';

type AuthScope = 'admin' | 'viewer';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly fieldErrors: ProblemEnvelope['error']['fieldErrors'];

  constructor(status: number, problem: ProblemEnvelope['error']) {
    super(problem.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem.code;
    this.requestId = problem.requestId;
    this.retryable = problem.retryable;
    this.fieldErrors = problem.fieldErrors;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  scope?: AuthScope;
  idempotencyKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? 20_000);
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.scope && unsafeMethods.has(method)) {
    const csrf = readCookie(options.scope === 'admin' ? 'nextstep_admin_csrf' : 'nextstep_viewer_csrf');
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  try {
    const response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
    if (response.status === 204) return undefined as T;
    const payload = await parseJSON(response);
    if (!response.ok) {
      if (isProblem(payload)) throw new ApiError(response.status, payload.error);
      throw new ApiError(response.status, {
        code: 'HTTP_ERROR',
        message: 'ระบบตอบกลับไม่สมบูรณ์ กรุณาลองใหม่',
        requestId: response.headers.get('X-Request-ID') ?? '',
        retryable: response.status >= 500
      });
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(0, { code: 'NETWORK_TIMEOUT', message: 'การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่', requestId: '', retryable: true });
    }
    throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'ไม่สามารถเชื่อมต่อระบบได้', requestId: '', retryable: true });
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function queryString(values: Record<string, string | number | undefined | null>): string {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

function readCookie(name: string): string {
  const prefix = `${encodeURIComponent(name)}=`;
  const match = document.cookie.split('; ').find((item) => item.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
}

async function parseJSON(response: Response): Promise<unknown> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isProblem(value: unknown): value is ProblemEnvelope {
  if (!value || typeof value !== 'object' || !('error' in value)) return false;
  const error = (value as { error?: unknown }).error;
  return !!error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string';
}
