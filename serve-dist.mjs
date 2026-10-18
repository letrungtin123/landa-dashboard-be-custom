// Production server for the admin dashboard build (dist/, base /admin/), in
// place of `vite preview`. Same settings vite preview reads in vite.config.ts:
// PROXY_BACKEND_URL (/api and /uploads), VITE_ALLOWED_HOSTS, VITE_PREVIEW_PORT,
// from .env, .env.local, .env.production, .env.production.local and the
// process environment. Same security headers (security-headers.mjs).
//
//   node serve-dist.mjs --host 0.0.0.0 --port 5274 [--dist <build folder>]
//
// Adds what vite preview lacks: hashed /admin/assets/* cached for a year
// (immutable), index.html revalidated (no-cache + ETag), brotli/gzip
// compressed once and kept in memory, compressed /api JSON, streaming proxy.

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadProductionEnv, parseAllowedHosts, startDistServer } from "./dist-server.mjs";
import { adminSecurityHeaders } from "./security-headers.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} name */
function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const env = await loadProductionEnv(rootDir);
const headers = adminSecurityHeaders();

startDistServer({
  name: "landa-admin",
  distDir: path.resolve(argument("--dist") || path.join(rootDir, "dist")),
  basePath: "/admin/",
  proxyPrefixes: ["/api", "/uploads"],
  backendUrl: env.PROXY_BACKEND_URL || "http://localhost:3001",
  allowedHosts: parseAllowedHosts(env.VITE_ALLOWED_HOSTS),
  securityHeaders: () => headers,
  // vite.config.ts proxy: cookieDomainRewrite ''.
  stripCookieDomain: true,
  host: argument("--host") || "0.0.0.0",
  port: Number(argument("--port") || env.VITE_PREVIEW_PORT) || 5274,
});
