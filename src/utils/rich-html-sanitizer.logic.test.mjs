/* global URL, process, setTimeout, MouseEvent, window, document, DOMPurify, RichLogic */
// Offline browser test of the shared rich-HTML sanitizer: the real DOMPurify
// build from node_modules runs in a headless browser with the app's config.
// Needs playwright(-core): TEST_PLAYWRIGHT_MODULE may point at an installed
// copy; TEST_BROWSER_CHANNEL picks an installed browser (default msedge).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const logicSource = readFileSync(new URL('./rich-html-sanitizer.logic.ts', import.meta.url), 'utf8');
const logicJs = ts.transpileModule(logicSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const purifyJs = readFileSync(require.resolve('dompurify/dist/purify.js'), 'utf8');

let browser;
let page;
let unavailable = '';

before(async () => {
  try {
    const { chromium } = require(process.env.TEST_PLAYWRIGHT_MODULE || 'playwright-core');
    browser = await chromium.launch({ headless: true, channel: process.env.TEST_BROWSER_CHANNEL || 'msedge' });
    page = await browser.newPage();
    await page.setContent('<!doctype html><html><body><div id="out"></div></body></html>');
    await page.addScriptTag({ content: purifyJs });
    await page.addScriptTag({ content: `(function(){ var exports = {}; ${logicJs}\n window.RichLogic = exports; window.RichLogic.installRichHtmlHooks(window.DOMPurify); })();` });
  } catch (error) {
    unavailable = error instanceof Error ? error.message.split('\n')[0] : String(error);
  }
});

after(async () => { await browser?.close(); });

const sanitize = (items) => page.evaluate((list) => list.map((html) => RichLogic.sanitizeRichHtmlWith(DOMPurify, html)), items);

test('script, event handlers (quoted and unquoted), javascript: URLs, svg and frames are removed and never run', async (t) => {
  if (unavailable) { t.skip(`browser unavailable: ${unavailable}`); return; }
  const payloads = [
    '<img src=x onerror=window.__xss=1>',
    '<img src="x" onerror="window.__xss=1">',
    '<svg onload=window.__xss=1><circle r=1></circle></svg>',
    '<a href="javascript:window.__xss=1">x</a>',
    '<a href="JaVaScRiPt:window.__xss=1">x</a>',
    '<a href="java&#x09;script:window.__xss=1">x</a>',
    '<a href=" javascript:window.__xss=1">x</a>',
    '<a href="data:text/html,<script>window.__xss=1</script>">x</a>',
    '<script>window.__xss=1</script><p>after</p>',
    '<iframe src="javascript:window.__xss=1"></iframe>',
    '<p onclick="window.__xss=1" onmouseover=window.__xss=1>text</p>',
    '<details open ontoggle=window.__xss=1>x</details>',
    '<math><mtext><table><mglyph><style><img src=x onerror=window.__xss=1>',
    '<form action="https://evil.test"><input name="password"></form>',
    '<object data="javascript:window.__xss=1"></object><embed src="javascript:window.__xss=1">',
  ];
  const output = await sanitize(payloads);
  for (const html of output) {
    assert.doesNotMatch(html, /on[a-z]+=/i, html);
    assert.doesNotMatch(html, /javascript:|data:text|<script|<svg|<iframe|<object|<embed|<form|<input|<math/i, html);
  }
  assert.equal(output[0], '<img src="x">');
  assert.equal(output[3], '<a>x</a>');
  assert.equal(output[8], '<p>after</p>');

  const fired = await page.evaluate(async (list) => {
    window.__xss = 0;
    const out = document.getElementById('out');
    for (const html of list) out.insertAdjacentHTML('beforeend', html);
    out.querySelectorAll('a,p,details').forEach((el) => { el.click?.(); el.dispatchEvent(new MouseEvent('mouseover')); });
    await new Promise((resolve) => setTimeout(resolve, 300));
    return window.__xss;
  }, output);
  assert.equal(fired, 0);
});

test('course content keeps tables, images, blockquotes, lists, headings and safe links', async (t) => {
  if (unavailable) { t.skip(`browser unavailable: ${unavailable}`); return; }
  const table = '<table style="width: 480px"><colgroup><col style="width: 120px"></colgroup><tbody><tr data-landa-row-height="40px" style="height: 40px"><th data-landa-cell-bg="#fef3c7" style="background-color: #fef3c7" colspan="2">H</th></tr><tr><td rowspan="1">1</td><td>2</td></tr></tbody></table>';
  const [tableOut, imageOut, textOut, linksOut, helpImg] = await sanitize([
    table,
    '<p><img src="/api/storage/11111111-1111-4111-8111-111111111111/courses/c/a.png" alt="A" width="200" data-landa-image-mode="inline"></p>',
    '<h2>Title</h2><blockquote><p>Quote</p></blockquote><ul><li><strong>one</strong></li></ul><ol><li><em>two</em></li></ol><p><span style="color: #ff0000" class="note">red</span><sub>2</sub><sup>3</sup></p>',
    '<p><a href="https://example.test/x" target="_blank">web</a> <a href="mailto:a@b.test">mail</a> <a href="/courses/1">rel</a> <a href="tel:123">tel</a></p>',
    '<img src="/x.png" role="button" tabindex="0" title="Zoom">',
  ]);
  assert.equal(tableOut, table);
  assert.match(imageOut, /<img src="\/api\/storage\/[^"]+" alt="A" width="200" data-landa-image-mode="inline">/);
  assert.equal(textOut, '<h2>Title</h2><blockquote><p>Quote</p></blockquote><ul><li><strong>one</strong></li></ul><ol><li><em>two</em></li></ol><p><span style="color: #ff0000" class="note">red</span><sub>2</sub><sup>3</sup></p>');
  assert.match(linksOut, /<a href="https:\/\/example\.test\/x" target="_blank" rel="noopener noreferrer">web<\/a>/);
  assert.match(linksOut, /<a href="mailto:a@b\.test">mail<\/a>/);
  assert.match(linksOut, /<a href="\/courses\/1">rel<\/a>/);
  assert.match(linksOut, /<a>tel<\/a>/);
  assert.equal(helpImg, '<img src="/x.png" role="button" tabindex="0" title="Zoom">');
});
