// Production web server for a Vite build (dist/), with Node built-ins only.
// Replaces `vite preview` for real traffic: precise cache headers, brotli/gzip
// compression cached in memory, conditional and range requests, and a
// streaming /api proxy. Never bundled into the browser app. The same file is
// used by the learner app (fe-5173) and the admin dashboard; keep them equal.
//
// Cache policy:
// - <base>assets/* (file names carry a content hash): public, one year, immutable;
// - everything else (index.html, SPA routes, public files): no-cache + ETag,
//   so a new release is seen at once and unchanged files answer 304.

import { Buffer } from "node:buffer";
import console from "node:console";
import { createServer, request as httpRequest, Agent as HttpAgent } from "node:http";
import { request as httpsRequest, Agent as HttpsAgent } from "node:https";
import { createReadStream } from "node:fs";
import { readFile, stat, readdir } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout } from "node:timers";
import { URL } from "node:url";
import { promisify } from "node:util";
import zlib from "node:zlib";

const brotliCompress = promisify(zlib.brotliCompress);
const gzipCompress = promisify(zlib.gzip);

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const REVALIDATE_CACHE_CONTROL = "no-cache";
/** Smaller bodies are sent as they are: compression would not pay for itself. */
export const MIN_COMPRESS_BYTES = 1024;
/** Upper bound for compressed static files kept in memory (least recently used are dropped). */
export const DEFAULT_COMPRESSED_CACHE_BYTES = 64 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
]);

/** @param {string} filePath */
export function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/** Text-like bodies compress well; images, video, fonts (woff/woff2) and archives are already compressed. */
export function isCompressibleType(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (!type || type === "text/event-stream") return false;
  return type.startsWith("text/")
    || type === "application/javascript"
    || type === "application/json"
    || type.endsWith("+json")
    || type === "application/xml"
    || type.endsWith("+xml")
    || type === "image/svg+xml"
    || type === "application/wasm"
    || type === "font/ttf"
    || type === "font/otf";
}

/**
 * Picks the response encoding from Accept-Encoding: brotli first, then gzip.
 * A coding with q=0 is refused; "*" stands for any coding not listed.
 * @param {string | undefined} acceptEncoding
 * @returns {"br" | "gzip" | null}
 */
export function negotiateEncoding(acceptEncoding) {
  if (!acceptEncoding) return null;
  const weights = new Map();
  for (const part of String(acceptEncoding).split(",")) {
    const [rawName, ...params] = part.trim().split(";");
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    let q = 1;
    for (const param of params) {
      const [key, value] = param.trim().split("=");
      if (key === "q") q = Number(value);
    }
    weights.set(name, Number.isFinite(q) ? q : 0);
  }
  const weightOf = (name) => (weights.has(name) ? weights.get(name) : (weights.get("*") ?? 0));
  if (weightOf("br") > 0) return "br";
  if (weightOf("gzip") > 0) return "gzip";
  return null;
}

/**
 * Cache-Control for a file path relative to the dist root ("assets/index-abc.js").
 * @param {string} relativePath
 */
export function cacheControlFor(relativePath) {
  return relativePath.startsWith("assets/") ? IMMUTABLE_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL;
}

/**
 * Maps a URL path (already without the base path) to a file inside distDir.
 * Null when it names a dotfile or is malformed. A path with ":" (SPA routes
 * such as /courses/course-v1:x+y/learn; never a build file) is not looked up
 * on disk (Windows drive letters and stream names), so `absolute` is null.
 * @param {string} distDir absolute
 * @param {string} urlPath e.g. "/assets/index.js"
 * @returns {{ absolute: string | null, relative: string } | null}
 */
export function resolveDistPath(distDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const segments = path.posix.normalize(`/${decoded}`).split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) return null;
  const relative = segments.join("/");
  if (segments.some((segment) => segment.includes(":"))) return { absolute: null, relative };
  const absolute = path.resolve(distDir, ...segments);
  const fromDist = path.relative(distDir, absolute);
  if (fromDist.startsWith("..") || path.isAbsolute(fromDist)) return null;
  return { absolute, relative };
}

/** Weak validator from size and modification time, like sirv/nginx. */
export function weakEtag(fileStat) {
  return `W/"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
}

/**
 * True when the client's cached copy is still current (answer 304).
 * @param {import("node:http").IncomingHttpHeaders} headers
 */
export function isNotModified(headers, etag, mtimeMs) {
  const ifNoneMatch = headers["if-none-match"];
  if (ifNoneMatch) {
    const strip = (tag) => tag.trim().replace(/^W\//, "");
    const wanted = strip(etag);
    return ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || strip(tag) === wanted);
  }
  const ifModifiedSince = headers["if-modified-since"];
  if (ifModifiedSince) {
    const since = Date.parse(ifModifiedSince);
    return Number.isFinite(since) && Math.floor(mtimeMs / 1000) <= Math.floor(since / 1000);
  }
  return false;
}

/**
 * One "bytes=" range. Multiple ranges are answered with the whole file.
 * @returns {{ start: number, end: number } | "unsatisfiable" | null}
 */
export function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || "").trim());
  if (!match) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;
  let start;
  let end;
  if (!startText) {
    const suffix = Number(endText);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Math.min(Number(endText), size - 1) : size - 1;
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/**
 * Same rule as Vite's allowedHosts check: IP addresses and localhost always,
 * otherwise an exact entry or a ".example.com" suffix entry.
 * @param {string | undefined} hostHeader
 * @param {readonly string[] | true} allowedHosts
 */
export function isAllowedHost(hostHeader, allowedHosts) {
  if (allowedHosts === true) return true;
  if (!hostHeader) return false;
  let hostname = String(hostHeader).trim().toLowerCase();
  if (hostname.startsWith("[")) {
    const close = hostname.indexOf("]");
    if (close === -1) return false;
    return isIP(hostname.slice(1, close)) === 6;
  }
  const colon = hostname.lastIndexOf(":");
  if (colon !== -1) hostname = hostname.slice(0, colon);
  if (!hostname) return false;
  if (isIP(hostname)) return true;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  return allowedHosts.some((entry) => {
    const allowed = entry.trim().toLowerCase();
    if (!allowed) return false;
    if (allowed.startsWith(".")) return hostname === allowed.slice(1) || hostname.endsWith(allowed);
    return hostname === allowed;
  });
}

/** Comma-separated host list from VITE_ALLOWED_HOSTS. */
export function parseAllowedHosts(raw) {
  return String(raw || "").split(",").map((value) => value.trim()).filter(Boolean);
}

/**
 * Minimal .env parser (KEY=VALUE, # comments, optional quotes, "export ").
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvText(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2];
    const quote = value[0];
    if ((quote === '"' || quote === "'" || quote === "`") && value.lastIndexOf(quote) > 0) {
      value = value.slice(1, value.lastIndexOf(quote));
      if (quote === '"') value = value.replace(/\\n/g, "\n");
    } else {
      const hash = value.indexOf(" #");
      if (hash !== -1) value = value.slice(0, hash);
      value = value.trim();
    }
    out[match[1]] = value;
  }
  return out;
}

/**
 * Environment the way `vite preview` (vite.config.ts loadEnv, mode
 * "production") sees it: .env < .env.local < .env.production <
 * .env.production.local < process.env.
 * @param {string} rootDir
 */
export async function loadProductionEnv(rootDir, processEnv = process.env) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    try {
      Object.assign(env, parseEnvText(await readFile(path.join(rootDir, name), "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  for (const [key, value] of Object.entries(processEnv)) {
    if (typeof value === "string") env[key] = value;
  }
  return env;
}

function appendVary(current, value) {
  const existing = String(current || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (existing.some((part) => part === "*" || part.toLowerCase() === value.toLowerCase())) return existing.join(", ");
  return [...existing, value].join(", ");
}

/** Least recently used map of compressed static bodies, bounded by total bytes. */
class CompressedCache {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    /** @type {Map<string, Buffer>} */
    this.entries = new Map();
    /** @type {Map<string, Promise<Buffer>>} */
    this.pending = new Map();
  }

  get(key) {
    const value = this.entries.get(key);
    if (value) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key, value) {
    if (value.length > this.maxBytes) return;
    const old = this.entries.get(key);
    if (old) {
      this.bytes -= old.length;
      this.entries.delete(key);
    }
    this.entries.set(key, value);
    this.bytes += value.length;
    for (const [oldestKey, oldest] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      this.entries.delete(oldestKey);
      this.bytes -= oldest.length;
    }
  }

  /** One compression per file version and coding, shared by concurrent requests. */
  async compressed(key, absolutePath, encoding) {
    const cached = this.get(key);
    if (cached) return cached;
    const running = this.pending.get(key);
    if (running) return running;
    const work = (async () => {
      const raw = await readFile(absolutePath);
      const body = encoding === "br"
        ? await brotliCompress(raw, { params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        } })
        : await gzipCompress(raw, { level: zlib.constants.Z_BEST_COMPRESSION });
      this.set(key, body);
      return body;
    })();
    this.pending.set(key, work);
    try {
      return await work;
    } finally {
      this.pending.delete(key);
    }
  }
}

function sendText(res, status, text, headers) {
  const body = Buffer.from(text, "utf8");
  res.writeHead(status, { ...headers, "Content-Type": "text/plain; charset=utf-8", "Content-Length": body.length, "Cache-Control": "no-store" });
  res.end(body);
}

/**
 * @typedef {object} DistServerOptions
 * @property {string} distDir absolute path of the Vite build output
 * @property {string} [basePath] Vite `base`, e.g. "/admin/" (default "/")
 * @property {readonly string[]} [proxyPrefixes] URL prefixes sent to the backend, e.g. ["/api"]
 * @property {string} [backendUrl] backend origin (and optional path) for proxyPrefixes
 * @property {readonly string[] | true} [allowedHosts] Vite allowedHosts rule
 * @property {(pathname: string) => Record<string, string>} [securityHeaders] headers for every response
 * @property {boolean} [stripCookieDomain] drop Domain= from backend Set-Cookie (vite cookieDomainRewrite: "")
 * @property {boolean} [rejectUnauthorizedBackend] verify the backend TLS certificate (default true)
 * @property {boolean} [compressApi] compress text/JSON backend answers the backend sent uncompressed (default true)
 * @property {number} [compressedCacheBytes]
 * @property {(message: string) => void} [log]
 */

/**
 * @param {DistServerOptions} options
 * @returns {{ server: import("node:http").Server, warmUp: () => Promise<void> }}
 */
export function createDistServer(options) {
  const distDir = path.resolve(options.distDir);
  const basePath = options.basePath || "/";
  if (!basePath.startsWith("/") || !basePath.endsWith("/")) throw new Error("basePath must start and end with /");
  const proxyPrefixes = options.proxyPrefixes || [];
  const allowedHosts = options.allowedHosts ?? [];
  const securityHeaders = options.securityHeaders || (() => ({}));
  const log = options.log || ((message) => console.error(message));
  const cache = new CompressedCache(options.compressedCacheBytes ?? DEFAULT_COMPRESSED_CACHE_BYTES);
  const backend = options.backendUrl ? new URL(options.backendUrl) : null;
  if (proxyPrefixes.length && !backend) throw new Error("backendUrl is required when proxyPrefixes are set");
  if (backend && backend.protocol !== "http:" && backend.protocol !== "https:") throw new Error("backendUrl must be http or https");
  const backendIsHttps = backend?.protocol === "https:";
  const agent = backend
    ? (backendIsHttps
      ? new HttpsAgent({ keepAlive: true, rejectUnauthorized: options.rejectUnauthorizedBackend !== false })
      : new HttpAgent({ keepAlive: true }))
    : null;
  const backendBasePath = backend ? backend.pathname.replace(/\/+$/, "") : "";

  /** @type {{ mtimeMs: number, size: number, body: Buffer, etag: string } | null} */
  let indexCache = null;
  async function readIndexHtml() {
    const file = path.join(distDir, "index.html");
    const fileStat = await stat(file);
    if (!indexCache || indexCache.mtimeMs !== fileStat.mtimeMs || indexCache.size !== fileStat.size) {
      indexCache = { mtimeMs: fileStat.mtimeMs, size: fileStat.size, body: await readFile(file), etag: weakEtag(fileStat) };
    }
    return indexCache;
  }

  function isProxied(pathname) {
    return proxyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
  }

  async function sendFile(req, res, resolved, fileStat, pathname, cacheControl) {
    const contentType = contentTypeFor(resolved.absolute);
    const etag = weakEtag(fileStat);
    const compressible = isCompressibleType(contentType) && fileStat.size >= MIN_COMPRESS_BYTES;
    const headers = {
      ...securityHeaders(pathname),
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      ETag: etag,
      "Last-Modified": new Date(fileStat.mtimeMs).toUTCString(),
      "Accept-Ranges": compressible ? "none" : "bytes",
    };
    if (compressible) headers.Vary = "Accept-Encoding";
    if (isNotModified(req.headers, etag, fileStat.mtimeMs)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const encoding = compressible ? negotiateEncoding(req.headers["accept-encoding"]) : null;
    if (encoding) {
      // A build step may leave <file>.br / <file>.gz next to the file.
      const precompressedPath = `${resolved.absolute}${encoding === "br" ? ".br" : ".gz"}`;
      let body = null;
      let precompressed = null;
      try {
        const preStat = await stat(precompressedPath);
        if (preStat.isFile() && preStat.mtimeMs >= fileStat.mtimeMs) precompressed = preStat;
      } catch { /* no precompressed file: compress below */ }
      if (precompressed) {
        res.writeHead(200, { ...headers, "Content-Encoding": encoding, "Content-Length": precompressed.size });
        if (req.method === "HEAD") { res.end(); return; }
        createReadStream(precompressedPath).on("error", () => res.destroy()).pipe(res);
        return;
      }
      body = await cache.compressed(`${resolved.absolute}|${fileStat.mtimeMs}|${fileStat.size}|${encoding}`, resolved.absolute, encoding);
      res.writeHead(200, { ...headers, "Content-Encoding": encoding, "Content-Length": body.length });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }
    const range = !compressible && req.headers.range && (!req.headers["if-range"] || req.headers["if-range"] === etag)
      ? parseRange(req.headers.range, fileStat.size)
      : null;
    if (range === "unsatisfiable") {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${fileStat.size}` });
      res.end();
      return;
    }
    if (range) {
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${fileStat.size}`, "Content-Length": range.end - range.start + 1 });
      if (req.method === "HEAD") { res.end(); return; }
      createReadStream(resolved.absolute, { start: range.start, end: range.end }).on("error", () => res.destroy()).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": fileStat.size });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(resolved.absolute).on("error", () => res.destroy()).pipe(res);
  }

  async function sendIndexHtml(req, res, pathname) {
    const index = await readIndexHtml();
    const headers = {
      ...securityHeaders(pathname),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": REVALIDATE_CACHE_CONTROL,
      ETag: index.etag,
      Vary: "Accept-Encoding",
    };
    if (isNotModified(req.headers, index.etag, index.mtimeMs)) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const encoding = index.body.length >= MIN_COMPRESS_BYTES ? negotiateEncoding(req.headers["accept-encoding"]) : null;
    const body = encoding
      ? await cache.compressed(`index|${index.mtimeMs}|${index.size}|${encoding}`, path.join(distDir, "index.html"), encoding)
      : index.body;
    res.writeHead(200, { ...headers, ...(encoding ? { "Content-Encoding": encoding } : {}), "Content-Length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      sendText(res, 405, "Method Not Allowed", { ...securityHeaders(pathname), Allow: "GET, HEAD" });
      return;
    }
    const withinBase = pathname.slice(basePath.length - 1); // keeps the leading "/"
    const resolved = resolveDistPath(distDir, withinBase);
    if (!resolved) {
      sendText(res, 404, "Not Found", securityHeaders(pathname));
      return;
    }
    if (resolved.absolute && resolved.relative && resolved.relative !== "index.html") {
      let fileStat = null;
      try {
        fileStat = await stat(resolved.absolute);
      } catch { /* not a file: SPA route or missing asset */ }
      if (fileStat?.isFile()) {
        await sendFile(req, res, resolved, fileStat, pathname, cacheControlFor(resolved.relative));
        return;
      }
    }
    // SPA route: the app's index.html. A missing file with an extension (an
    // old hashed chunk after a release) gets 404, not HTML under a .js name.
    const lastSegment = resolved.relative.split("/").pop() || "";
    const wantsHtml = String(req.headers.accept || "").includes("text/html");
    if (!wantsHtml && path.extname(lastSegment) && resolved.relative !== "index.html") {
      sendText(res, 404, "Not Found", securityHeaders(pathname));
      return;
    }
    await sendIndexHtml(req, res, pathname);
  }

  function proxy(req, res, pathname, pathAndQuery) {
    const upstreamHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP_HEADERS.has(name) && value !== undefined) upstreamHeaders[name] = value;
    }
    // Same forwarding as the vite preview proxy (changeOrigin + xfwd): the
    // client address is appended, never replaces what an earlier hop sent.
    const peer = req.socket.remoteAddress || "";
    const append = (name, value) => {
      const previous = Array.isArray(upstreamHeaders[name]) ? upstreamHeaders[name].join(", ") : upstreamHeaders[name];
      upstreamHeaders[name] = previous ? `${previous}, ${value}` : value;
    };
    if (peer) append("x-forwarded-for", peer);
    const hostHeader = req.headers.host || "";
    const portMatch = /:(\d+)$/.exec(hostHeader);
    append("x-forwarded-port", portMatch ? portMatch[1] : (req.socket.encrypted ? "443" : "80"));
    append("x-forwarded-proto", req.socket.encrypted ? "https" : "http");
    if (!upstreamHeaders["x-forwarded-host"] && hostHeader) upstreamHeaders["x-forwarded-host"] = hostHeader;
    upstreamHeaders.host = backend.host;

    const send = backendIsHttps ? httpsRequest : httpRequest;
    const upstream = send({
      protocol: backend.protocol,
      hostname: backend.hostname,
      port: backend.port || (backendIsHttps ? 443 : 80),
      method: req.method,
      path: `${backendBasePath}${pathAndQuery}`,
      headers: upstreamHeaders,
      agent,
    }, (upstreamRes) => {
      // Lower-case names: a backend header replaces the same security header.
      const headers = Object.fromEntries(Object.entries(securityHeaders(pathname)).map(([name, value]) => [name.toLowerCase(), value]));
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        if (HOP_BY_HOP_HEADERS.has(name) || value === undefined) continue;
        headers[name] = value;
      }
      if (options.stripCookieDomain && headers["set-cookie"]) {
        headers["set-cookie"] = [].concat(headers["set-cookie"]).map((cookie) => cookie.replace(/;\s*domain=[^;]*/gi, ""));
      }
      const status = upstreamRes.statusCode || 502;
      const length = Number(upstreamRes.headers["content-length"]);
      const encoding = options.compressApi !== false
        && req.method !== "HEAD"
        && status >= 200 && status !== 204 && status !== 304
        && !upstreamRes.headers["content-encoding"]
        && !/no-transform/i.test(String(upstreamRes.headers["cache-control"] || ""))
        && isCompressibleType(upstreamRes.headers["content-type"])
        && !(Number.isFinite(length) && length < MIN_COMPRESS_BYTES)
        ? negotiateEncoding(req.headers["accept-encoding"])
        : null;
      if (!encoding) {
        res.writeHead(status, headers);
        // Streams (AI answers over text/event-stream) get their headers at once.
        if (String(upstreamRes.headers["content-type"] || "").startsWith("text/event-stream")) res.flushHeaders();
        upstreamRes.pipe(res);
        return;
      }
      // API JSON is compressed on the fly; a fast level keeps the CPU cost low.
      delete headers["content-length"];
      headers["content-encoding"] = encoding;
      headers.vary = appendVary(headers.vary, "Accept-Encoding");
      res.writeHead(status, headers);
      const compressor = encoding === "br"
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : zlib.createGzip({ level: 6 });
      compressor.on("error", () => res.destroy());
      upstreamRes.pipe(compressor).pipe(res);
    });
    upstream.on("error", (error) => {
      log(`[dist-server] proxy ${req.method} ${pathname} failed: ${error.code || error.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { ...securityHeaders(pathname), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "Bad Gateway" }));
      } else {
        res.destroy();
      }
    });
    // The browser left (tab closed, request aborted): stop the backend request too.
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  }

  async function handle(req, res) {
    let url;
    try {
      url = new URL(req.url || "/", "http://internal");
    } catch {
      sendText(res, 400, "Bad Request", {});
      return;
    }
    const pathname = url.pathname;
    if (!isAllowedHost(req.headers.host, allowedHosts)) {
      sendText(res, 403, "Blocked request: this host is not allowed.", securityHeaders(pathname));
      return;
    }
    if (isProxied(pathname)) {
      proxy(req, res, pathname, `${pathname}${url.search}`);
      return;
    }
    if (basePath !== "/" && !pathname.startsWith(basePath)) {
      // Same answers as vite preview with a base path, plus "/admin" -> "/admin/".
      if (pathname === "/" || pathname === "/index.html" || `${pathname}/` === basePath) {
        res.writeHead(302, { ...securityHeaders(pathname), Location: `${basePath}${url.search}`, "Cache-Control": "no-store" });
        res.end();
        return;
      }
      sendText(res, 404, `Not Found. This site is served under ${basePath}`, securityHeaders(pathname));
      return;
    }
    await serveStatic(req, res, pathname);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(`[dist-server] ${req.method} ${req.url} failed: ${error?.code || error?.message || error}`);
      if (!res.headersSent) sendText(res, 500, "Internal Server Error", {});
      else res.destroy();
    });
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  /** Compresses the hashed assets once at start, so the first visitors get cached brotli bodies. */
  async function warmUp() {
    const assetsDir = path.join(distDir, "assets");
    let names = [];
    try {
      names = await readdir(assetsDir);
    } catch {
      return;
    }
    for (const name of names) {
      const absolute = path.join(assetsDir, name);
      try {
        const fileStat = await stat(absolute);
        if (!fileStat.isFile() || fileStat.size < MIN_COMPRESS_BYTES || !isCompressibleType(contentTypeFor(absolute))) continue;
        await cache.compressed(`${absolute}|${fileStat.mtimeMs}|${fileStat.size}|br`, absolute, "br");
      } catch (error) {
        log(`[dist-server] warm-up skipped ${name}: ${error?.code || error?.message}`);
      }
    }
  }

  return { server, warmUp };
}

/**
 * Starts the server and stops it cleanly on SIGINT/SIGTERM (PM2 restarts).
 * @param {DistServerOptions & { port: number, host: string, name: string }} options
 */
export function startDistServer(options) {
  const { server, warmUp } = createDistServer(options);
  server.listen(options.port, options.host, () => {
    console.log(`[${options.name}] serving ${options.distDir} on http://${options.host}:${options.port}${options.basePath || "/"}`);
    void warmUp();
  });
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[${options.name}] ${signal}: closing`);
    server.close(() => process.exit(0));
    server.closeIdleConnections?.();
    // Open streams (AI answers) get a short grace period, then the process exits.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  return server;
}
