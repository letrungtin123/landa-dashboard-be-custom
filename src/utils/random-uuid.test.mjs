import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('./random-uuid.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { secureRandomUuid, secureRandomUuidOrNull } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uses crypto.randomUUID when the page is a secure context', () => {
  const id = secureRandomUuid({ randomUUID: () => '11111111-1111-4111-8111-111111111111', getRandomValues: () => { throw new Error('unused'); } });
  assert.equal(id, '11111111-1111-4111-8111-111111111111');
});

test('plain http (no randomUUID): a UUID v4 from getRandomValues, a new one each time', () => {
  let seed = 0;
  const httpCrypto = { getRandomValues: bytes => { for (let i = 0; i < bytes.length; i++) bytes[i] = (seed * 31 + i * 17) & 0xff; seed++; return bytes; } };
  const first = secureRandomUuid(httpCrypto);
  const second = secureRandomUuid(httpCrypto);
  assert.match(first, UUID_V4);
  assert.match(second, UUID_V4);
  assert.notEqual(first, second);
  assert.match(secureRandomUuid(globalThis.crypto), UUID_V4);
});

test('no secure random source: null, or an error, never Math.random', () => {
  assert.equal(secureRandomUuidOrNull(null), null);
  assert.equal(secureRandomUuidOrNull({}), null);
  assert.throws(() => secureRandomUuid(null), /Secure browser randomness is unavailable/);
  const code = ts.transpileModule(source, { compilerOptions: { removeComments: true } }).outputText;
  assert.doesNotMatch(code, /Math\.random|Date\.now/);
});

test('no app code calls crypto.randomUUID() without the fallback', () => {
  const src = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const offenders = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const file = path.join(dir, entry);
      if (statSync(file).isDirectory()) { walk(file); continue; }
      if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue;
      const text = readFileSync(file, 'utf8');
      // Allowed only behind a feature check on the same or the previous line.
      const lines = text.split(/\r?\n/);
      const guard = /typeof [\w?.]*randomUUID\s*===\s*['"]function['"]|crypto\?\.randomUUID\)/;
      lines.forEach((line, index) => {
        if (/crypto\.randomUUID\(\)/.test(line) && !guard.test(line) && !guard.test(lines[index - 1] ?? '')) {
          offenders.push(`${path.relative(src, file)}: ${line.trim()}`);
        }
      });
    }
  })(src);
  assert.deepEqual(offenders, []);
});
