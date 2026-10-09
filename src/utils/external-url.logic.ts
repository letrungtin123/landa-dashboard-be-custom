// ═══════════════════════════════════════════════════════════════
// External site links (e.g. the tenant's learner site)
// ═══════════════════════════════════════════════════════════════

/**
 * The URL when it is an absolute http(s) address, otherwise null (no link is
 * shown). A tenant domain such as `javascript:...` must never become a link.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const value = (raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** Opens a link in a new tab that cannot reach back to this page. */
export function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
