import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const output = ts.transpileModule(readFileSync(new URL('./chunk-reload.logic.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { CHUNK_RELOAD_MIN_INTERVAL_MS, CHUNK_RELOAD_STORAGE_KEY, installChunkReloadGuard, shouldReloadAfterChunkError } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

function fakeWindow(storage = new Map(), { storageThrows = false } = {}) {
  const listeners = {};
  const win = {
    reloads: 0,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    sessionStorage: {
      getItem: (key) => { if (storageThrows) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (storageThrows) throw new Error('blocked'); storage.set(key, value); },
    },
    location: { reload: () => { win.reloads += 1; } },
    fire: () => { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; listeners['vite:preloadError'](event); return event; },
  };
  return win;
}

test('a chunk that fails after a release reloads the tab once, never in a loop', () => {
  let clock = 1_000_000;
  const win = fakeWindow();
  installChunkReloadGuard(win, () => clock);
  assert.equal(win.fire().defaultPrevented, true);
  assert.equal(win.reloads, 1);
  clock += 5_000;
  assert.equal(win.fire().defaultPrevented, false, 'second failure soon after: the error shows');
  assert.equal(win.reloads, 1);
  clock += CHUNK_RELOAD_MIN_INTERVAL_MS + 1;
  assert.equal(win.fire().defaultPrevented, true);
  assert.equal(win.reloads, 2);
});

test('without session storage the error shows instead of reloading', () => {
  const win = fakeWindow(new Map(), { storageThrows: true });
  installChunkReloadGuard(win, () => 1);
  assert.equal(win.fire().defaultPrevented, false);
  assert.equal(win.reloads, 0);
});

test('the guard rule and its installation in main.tsx', () => {
  assert.equal(shouldReloadAfterChunkError(null, 10), true);
  assert.equal(shouldReloadAfterChunkError('garbage', 10), true);
  assert.equal(shouldReloadAfterChunkError(String(10), 10 + CHUNK_RELOAD_MIN_INTERVAL_MS), false);
  assert.equal(CHUNK_RELOAD_STORAGE_KEY, 'landa-admin-chunk-reload-at');
  assert.match(readFileSync(new URL('../main.tsx', import.meta.url), 'utf8'), /installChunkReloadGuard\(window\)/);
});
