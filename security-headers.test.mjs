import assert from "node:assert/strict";
import test from "node:test";
import { adminSecurityHeaders } from "./security-headers.mjs";

test("admin pages: nosniff, referrer policy, same-site framing only, no HSTS", () => {
  assert.deepEqual(adminSecurityHeaders(), {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "frame-ancestors 'self'",
  });
});
