// Production server for the admin dashboard build (dist/, base /admin/), in
// place of `vite preview`. Same settings vite preview reads in vite.config.ts
// (serve-dist.options.mjs), from .env, .env.local, .env.production,
// .env.production.local and the process environment, same security headers.
//
//   node serve-dist.mjs --host 0.0.0.0 --port 5274 [--dist <build folder>]
//
// Adds what vite preview lacks: hashed /admin/assets/* cached for a year
// (immutable), index.html revalidated (no-cache + ETag), brotli/gzip
// compressed once and kept in memory, compressed /api JSON, streaming proxy.

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadProductionEnv, startDistServer } from "./dist-server.mjs";
import { adminServeOptions } from "./serve-dist.options.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

startDistServer(adminServeOptions(await loadProductionEnv(rootDir), process.argv));
