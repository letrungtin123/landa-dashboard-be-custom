import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers";
import zlib from "node:zlib";
import {
  IMMUTABLE_CACHE_CONTROL, REVALIDATE_CACHE_CONTROL, cacheControlFor, createDistServer, isAllowedHost,
  isCompressibleType, negotiateEncoding, parseEnvText, parseRange, resolveDistPath,
} from "./dist-server.mjs";

function call(port, pathname, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: pathname, method, headers: { host: `localhost:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()); });

test("encoding negotiation prefers brotli, honours q=0 and *", () => {
  assert.equal(negotiateEncoding("gzip, deflate, br, zstd"), "br");
  assert.equal(negotiateEncoding("gzip, deflate"), "gzip");
  assert.equal(negotiateEncoding("br;q=0, gzip;q=0.5"), "gzip");
  assert.equal(negotiateEncoding("*"), "br");
  assert.equal(negotiateEncoding("identity"), null);
  assert.equal(negotiateEncoding(undefined), null);
});

test("only hashed assets are cached for a year; everything else revalidates", () => {
  assert.equal(cacheControlFor("assets/index-Ab12.js"), IMMUTABLE_CACHE_CONTROL);
  assert.equal(cacheControlFor("index.html"), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor("fonts/a.woff"), REVALIDATE_CACHE_CONTROL);
  assert.equal(cacheControlFor("favicon.svg"), REVALIDATE_CACHE_CONTROL);
});

test("compressible types: text, scripts, JSON, SVG; never event streams or already compressed media", () => {
  for (const type of ["text/html; charset=utf-8", "text/javascript", "application/json; charset=utf-8", "image/svg+xml", "application/problem+json"]) {
    assert.equal(isCompressibleType(type), true, type);
  }
  for (const type of ["text/event-stream", "image/png", "video/mp4", "font/woff2", "application/pdf", "application/x-ndjson", undefined]) {
    assert.equal(isCompressibleType(type), false, String(type));
  }
});

test("paths never leave dist, dotfiles are refused, SPA routes with ':' are not looked up on disk", () => {
  const dist = path.resolve(os.tmpdir(), "dist-x");
  assert.equal(resolveDistPath(dist, "/assets/a.js").relative, "assets/a.js");
  assert.equal(resolveDistPath(dist, "/assets/../../../etc/passwd").relative, "etc/passwd");
  assert.equal(resolveDistPath(dist, "/%2e%2e/%2e%2e/secret").relative, "secret");
  assert.equal(resolveDistPath(dist, "/.vite/manifest.json"), null);
  assert.equal(resolveDistPath(dist, "/a%00b"), null);
  assert.equal(resolveDistPath(dist, "/a%5c..%5cb"), null);
  assert.equal(resolveDistPath(dist, "/%E0%A4%A"), null);
  assert.deepEqual(resolveDistPath(dist, "/courses/course-v1:nesso+1+2026/learn"), { absolute: null, relative: "courses/course-v1:nesso+1+2026/learn" });
});

test("single byte ranges; unsatisfiable and malformed ranges", () => {
  assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=0-5000", 1000), { start: 0, end: 999 });
  assert.equal(parseRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(parseRange("bytes=0-1,5-6", 1000), null);
  assert.equal(parseRange("items=0-1", 1000), null);
});

test("host check matches vite allowedHosts: IPs and localhost always, entries exact or .suffix", () => {
  const hosts = ["demo.example.com", ".nesso.com.vn"];
  assert.equal(isAllowedHost("127.0.0.1:5274", hosts), true);
  assert.equal(isAllowedHost("[::1]:5274", hosts), true);
  assert.equal(isAllowedHost("localhost:5274", hosts), true);
  assert.equal(isAllowedHost("demo.example.com", hosts), true);
  assert.equal(isAllowedHost("a.nesso.com.vn:5273", hosts), true);
  assert.equal(isAllowedHost("nesso.com.vn", hosts), true);
  assert.equal(isAllowedHost("evil.example.com", hosts), false);
  assert.equal(isAllowedHost("nesso.com.vn.evil.io", hosts), false);
  assert.equal(isAllowedHost(undefined, hosts), false);
  assert.equal(isAllowedHost("anything", true), true);
});

test(".env parsing: comments, quotes, export, inline comments", () => {
  assert.deepEqual(parseEnvText("# c\nA=1\nexport B = two \nC=\"x y\"\nD='z'\nE=v # note\nbad line\n"), { A: "1", B: "two", C: "x y", D: "z", E: "v" });
});

test("serves a Vite build under /admin/ with cache headers, compression, 304, ranges and an /api proxy", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dist-server-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = path.join(root, "dist");
  await mkdir(path.join(dist, "assets"), { recursive: true });
  const script = Buffer.from(`console.log(${JSON.stringify("x".repeat(5000))});\n`);
  const video = Buffer.alloc(4096, 7);
  const indexHtml = `<!doctype html><html><head><script type="module" src="/admin/assets/app-abc.js"></script></head><body>${"<!-- pad -->".repeat(100)}</body></html>`;
  await writeFile(path.join(dist, "index.html"), indexHtml);
  await writeFile(path.join(dist, "assets", "app-abc.js"), script);
  await writeFile(path.join(dist, "assets", "clip-abc.mp4"), video);
  await writeFile(path.join(dist, "favicon.svg"), "<svg/>");

  const seen = [];
  const backend = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({ url: req.url, headers: req.headers, bytes: Buffer.concat(chunks).length });
      if (req.url.startsWith("/api/json")) {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "set-cookie": "sid=1; Domain=backend.local; Path=/; HttpOnly", "x-frame-options": "DENY" });
        res.end(JSON.stringify({ items: Array.from({ length: 200 }, (_, i) => ({ i, name: `row ${i}` })) }));
      } else if (req.url === "/api/stream") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        res.write("data: one\n\n");
        setTimeout(() => res.end("data: two\n\n"), 20);
      } else if (req.url === "/uploads/a.png") {
        res.writeHead(200, { "content-type": "image/png", "content-length": "3" });
        res.end("png");
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ bytes: Buffer.concat(chunks).length }));
      }
    });
  });
  const backendPort = await listen(backend);
  t.after(() => close(backend));

  const { server } = createDistServer({
    distDir: dist,
    basePath: "/admin/",
    proxyPrefixes: ["/api", "/uploads"],
    backendUrl: `http://127.0.0.1:${backendPort}`,
    allowedHosts: [".example.com"],
    securityHeaders: () => ({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "SAMEORIGIN" }),
    stripCookieDomain: true,
    log: () => {},
  });
  const port = await listen(server);
  t.after(() => close(server));

  // Hashed asset: brotli, gzip or plain, cached for a year, same bytes.
  const br = await call(port, "/admin/assets/app-abc.js", { headers: { "accept-encoding": "gzip, br" } });
  assert.equal(br.status, 200);
  assert.equal(br.headers["content-encoding"], "br");
  assert.equal(br.headers["cache-control"], IMMUTABLE_CACHE_CONTROL);
  assert.equal(br.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(br.headers.vary, "Accept-Encoding");
  assert.equal(br.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(zlib.brotliDecompressSync(br.body), script);
  assert.ok(br.body.length < script.length / 10);
  const gz = await call(port, "/admin/assets/app-abc.js", { headers: { "accept-encoding": "gzip" } });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.deepEqual(zlib.gunzipSync(gz.body), script);
  const plain = await call(port, "/admin/assets/app-abc.js");
  assert.equal(plain.headers["content-encoding"], undefined);
  assert.equal(Number(plain.headers["content-length"]), script.length);
  const revalidated = await call(port, "/admin/assets/app-abc.js", { headers: { "if-none-match": br.headers.etag } });
  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.body.length, 0);

  // SPA routes get index.html (no-cache); a missing chunk is 404, not HTML.
  const route = await call(port, "/admin/courses/course-v1:x+y+2026/edit", { headers: { accept: "text/html" } });
  assert.equal(route.status, 200);
  assert.equal(route.headers["cache-control"], REVALIDATE_CACHE_CONTROL);
  assert.equal(route.body.toString(), indexHtml);
  assert.equal((await call(port, "/admin/users")).status, 200);
  assert.equal((await call(port, "/admin/assets/old-chunk.js", { headers: { accept: "*/*" } })).status, 404);
  const indexBr = await call(port, "/admin/", { headers: { "accept-encoding": "br", accept: "text/html" } });
  assert.equal(indexBr.headers["content-encoding"], "br");
  assert.equal(zlib.brotliDecompressSync(indexBr.body).toString(), indexHtml);
  assert.equal((await call(port, "/admin/", { headers: { "if-none-match": indexBr.headers.etag } })).status, 304);
  assert.equal((await call(port, "/admin/favicon.svg")).headers["cache-control"], REVALIDATE_CACHE_CONTROL);
  assert.equal((await call(port, "/admin/.vite/manifest.json")).status, 404);
  assert.equal((await call(port, "/admin/%2e%2e/%2e%2e/dist-server.mjs", { headers: { accept: "*/*" } })).status, 404);

  // Base path answers like vite preview, plus /admin -> /admin/.
  const rootRedirect = await call(port, "/?lang=en");
  assert.equal(rootRedirect.status, 302);
  assert.equal(rootRedirect.headers.location, "/admin/?lang=en");
  assert.equal((await call(port, "/admin")).headers.location, "/admin/");
  assert.equal((await call(port, "/elsewhere")).status, 404);
  assert.equal((await call(port, "/admin/assets/app-abc.js", { method: "POST" })).status, 405);

  // Media: byte ranges, never compressed.
  const part = await call(port, "/admin/assets/clip-abc.mp4", { headers: { range: "bytes=10-19", "accept-encoding": "br" } });
  assert.equal(part.status, 206);
  assert.equal(part.headers["content-range"], `bytes 10-19/${video.length}`);
  assert.deepEqual(part.body, video.subarray(10, 20));
  assert.equal((await call(port, "/admin/assets/clip-abc.mp4", { headers: { range: "bytes=99999-" } })).status, 416);

  // Host check.
  assert.equal((await call(port, "/admin/", { headers: { host: "evil.test" } })).status, 403);
  assert.equal((await call(port, "/admin/", { headers: { host: "demo.example.com" } })).status, 200);

  // API: JSON compressed on the fly, forwarding headers appended, cookie domain dropped.
  const api = await call(port, "/api/json?page=2", { headers: { "accept-encoding": "br", "x-forwarded-for": "198.51.100.9" } });
  assert.equal(api.status, 200);
  assert.equal(api.headers["content-encoding"], "br");
  assert.equal(JSON.parse(zlib.brotliDecompressSync(api.body)).items.length, 200);
  assert.equal(api.headers["x-frame-options"], "DENY", "a backend header replaces the same security header");
  assert.equal(api.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(api.headers["set-cookie"], ["sid=1; Path=/; HttpOnly"]);
  const forwarded = seen.find((entry) => entry.url === "/api/json?page=2").headers;
  assert.equal(forwarded["x-forwarded-for"], "198.51.100.9, 127.0.0.1");
  assert.equal(forwarded.host, `127.0.0.1:${backendPort}`);
  assert.equal(forwarded["x-forwarded-host"], `localhost:${port}`);
  assert.equal(forwarded["x-forwarded-proto"], "http");

  // Event streams pass through uncompressed; uploads stream through in full.
  const stream = await call(port, "/api/stream", { headers: { "accept-encoding": "br" } });
  assert.equal(stream.headers["content-encoding"], undefined);
  assert.equal(stream.body.toString(), "data: one\n\ndata: two\n\n");
  const upload = Buffer.alloc(5 * 1024 * 1024, 1);
  const uploaded = await call(port, "/api/upload", { method: "POST", headers: { "content-type": "application/octet-stream", "content-length": upload.length }, body: upload });
  assert.equal(JSON.parse(uploaded.body.toString()).bytes, upload.length);
  assert.equal((await call(port, "/uploads/a.png", { headers: { "accept-encoding": "br" } })).body.toString(), "png");

  // Backend down: 502, the static site keeps working.
  await close(backend);
  const down = await call(port, "/api/json");
  assert.equal(down.status, 502);
  assert.equal((await call(port, "/admin/assets/app-abc.js")).status, 200);
});
