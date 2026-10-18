// Settings of serve-dist.mjs, from the same values vite.config.ts gives
// `vite preview`: base /admin/, /api and /uploads to PROXY_BACKEND_URL
// (default http://localhost:3001), VITE_ALLOWED_HOSTS, preview host 0.0.0.0
// and VITE_PREVIEW_PORT (default 5274), security-headers.mjs, cookieDomainRewrite ''.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAllowedHosts } from "./dist-server.mjs";
import { adminSecurityHeaders } from "./security-headers.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** @param {readonly string[]} argv @param {string} name */
function argument(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * @param {Record<string, string>} env  loadProductionEnv(rootDir)
 * @param {readonly string[]} argv      process.argv (--host, --port, --dist)
 */
export function adminServeOptions(env, argv) {
  const headers = adminSecurityHeaders();
  return {
    name: "landa-admin",
    distDir: path.resolve(argument(argv, "--dist") || path.join(rootDir, "dist")),
    basePath: "/admin/",
    proxyPrefixes: ["/api", "/uploads"],
    backendUrl: env.PROXY_BACKEND_URL || "http://localhost:3001",
    allowedHosts: parseAllowedHosts(env.VITE_ALLOWED_HOSTS),
    securityHeaders: () => headers,
    stripCookieDomain: true,
    host: argument(argv, "--host") || "0.0.0.0",
    port: Number(argument(argv, "--port") || env.VITE_PREVIEW_PORT) || 5274,
  };
}
