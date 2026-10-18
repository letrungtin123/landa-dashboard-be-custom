import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { adminServeOptions } from "./serve-dist.options.mjs";
import { adminSecurityHeaders } from "./security-headers.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

test("serve-dist uses the vite preview settings: /admin/, /api and /uploads, allowed hosts, port, headers", () => {
  const options = adminServeOptions({ PROXY_BACKEND_URL: "http://localhost:3101", VITE_ALLOWED_HOSTS: "a.example.com, .b.example.com", VITE_PREVIEW_PORT: "5999" }, ["node", "serve-dist.mjs"]);
  assert.equal(options.basePath, "/admin/");
  assert.deepEqual(options.proxyPrefixes, ["/api", "/uploads"]);
  assert.equal(options.backendUrl, "http://localhost:3101");
  assert.deepEqual(options.allowedHosts, ["a.example.com", ".b.example.com"]);
  assert.equal(options.host, "0.0.0.0");
  assert.equal(options.port, 5999);
  assert.equal(options.stripCookieDomain, true);
  assert.equal(options.distDir, path.join(root, "dist"));
  assert.deepEqual(options.securityHeaders("/admin/"), adminSecurityHeaders());
});

test("PM2 arguments win over .env, defaults match vite.config.ts", () => {
  const options = adminServeOptions({ VITE_PREVIEW_PORT: "5999" }, ["node", "serve-dist.mjs", "--host", "127.0.0.1", "--port", "5274", "--dist", "build"]);
  assert.equal(options.port, 5274);
  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.distDir, path.resolve("build"));
  const defaults = adminServeOptions({}, ["node", "serve-dist.mjs"]);
  assert.equal(defaults.backendUrl, "http://localhost:3001");
  assert.equal(defaults.port, 5274);
  assert.deepEqual(defaults.allowedHosts, []);
});
