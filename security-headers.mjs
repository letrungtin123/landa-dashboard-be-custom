// Server-side security headers for the admin dashboard as served by
// `vite preview` (PM2) and `vite dev`. Never bundled into the browser app.
//
// - nosniff and a referrer policy on every response;
// - the admin app may be framed only by its own site (clickjacking);
// - no Strict-Transport-Security: customers still use http:// addresses.
// A full Content-Security-Policy is intentionally not sent: index.html and
// the app depend on per-deployment API, storage, SSO and AI origins (some
// http://), so only frame-ancestors is enforced.

/** @returns {Record<string, string>} */
export function adminSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "frame-ancestors 'self'",
  };
}
