// Retry rule shared by every React Query query (App.tsx defaults).

/** At most this many retries after the first failed attempt (3 attempts in total). */
export const MAX_QUERY_RETRIES = 2;

/**
 * HTTP status of a failed request: axios errors carry it in `response.status`,
 * typed API errors (WorkspaceReadError, ...) in `status`. Null when the request
 * never got an answer (network error, timeout, aborted).
 */
export function requestErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = (error as { response?: { status?: unknown } }).response?.status
    ?? (error as { status?: unknown }).status;
  return typeof candidate === 'number' && Number.isInteger(candidate) ? candidate : null;
}

/**
 * A 4xx answer (no permission, not found, invalid input, rate limited) will
 * not change on a retry, so it is shown at once. Network errors, timeouts and
 * 5xx answers are retried at most MAX_QUERY_RETRIES times.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = requestErrorStatus(error);
  if (status !== null && status >= 400 && status < 500) return false;
  return failureCount < MAX_QUERY_RETRIES;
}
