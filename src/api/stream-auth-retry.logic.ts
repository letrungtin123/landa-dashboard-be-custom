// ═══════════════════════════════════════════════════════════════
// Live stream sign-in retries (AI course design workspace/source streams)
//
// After a 401 the stream asks for a session refresh. It reconnects at once
// only when the access token really changed, and only once in a row; a
// second 401, or a refresh that left the same token in place (e.g. the
// refresh cooldown), goes through the normal backoff instead of a tight
// reconnect loop.
// ═══════════════════════════════════════════════════════════════

export const MAX_IMMEDIATE_UNAUTHORIZED_RETRIES = 1;

export function retryAfterUnauthorized(
  usedToken: string | null | undefined,
  currentToken: string | null | undefined,
  immediateRetriesSoFar: number,
): 'retry_now' | 'back_off' {
  const changed = !!currentToken && currentToken !== usedToken;
  return changed && immediateRetriesSoFar < MAX_IMMEDIATE_UNAUTHORIZED_RETRIES ? 'retry_now' : 'back_off';
}
