/* global URL, Buffer, setTimeout */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// S2 T12: tabs never replay a refresh token another tab already rotated.
const source = readFileSync(new URL('./cross-tab-session.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { decideRefresh, classifyStorageChange, readStoredSession, withCrossTabLock, ADOPT_MIN_VALIDITY_MS } =
  await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const NOW = 1_000_000;
const stored = (refreshToken, expiresInMs = 600_000, isAuthenticated = true) =>
  ({ isAuthenticated, accessToken: 'a', refreshToken, tokenExpiresAt: NOW + expiresInMs });

test('inside the lock a tab adopts a session another tab already refreshed', () => {
  assert.deepEqual(decideRefresh('old', stored('new'), NOW), { action: 'adopt' });
});

test('a rotated stored session close to expiry is refreshed with the STORED token, never the used one', () => {
  assert.deepEqual(decideRefresh('old', stored('new', ADOPT_MIN_VALIDITY_MS - 1), NOW), { action: 'refresh', refreshToken: 'new' });
});

test('the same token in memory and storage is refreshed normally', () => {
  assert.deepEqual(decideRefresh('same', stored('same'), NOW), { action: 'refresh', refreshToken: 'same' });
  assert.deepEqual(decideRefresh('mine', null, NOW), { action: 'refresh', refreshToken: 'mine' });
  assert.deepEqual(decideRefresh(null, null, NOW), { action: 'none' });
});

test('storage changes from other tabs: adopt new tokens, follow sign-out, ignore our own', () => {
  assert.equal(classifyStorageChange('old', stored('new')), 'adopt');
  assert.equal(classifyStorageChange('old', null), 'signed_out');
  assert.equal(classifyStorageChange('old', stored(null, 0, false)), 'signed_out');
  assert.equal(classifyStorageChange('same', stored('same')), 'unchanged');
  assert.equal(classifyStorageChange(null, null), 'unchanged');
});

test('persisted zustand JSON is read defensively', () => {
  assert.deepEqual(readStoredSession(JSON.stringify({ state: { isAuthenticated: true, accessToken: 'a', refreshToken: 'r', tokenExpiresAt: 5 }, version: 0 })),
    { isAuthenticated: true, accessToken: 'a', refreshToken: 'r', tokenExpiresAt: 5 });
  assert.equal(readStoredSession('not json'), null);
  assert.equal(readStoredSession(null), null);
});

test('Web Locks serialize refreshes across tabs', async () => {
  const order = [];
  let chain = Promise.resolve();
  const locks = { request: (_name, _options, callback) => { const run = chain.then(callback); chain = run.catch(() => undefined); return run; } };
  const task = (id) => async () => { order.push(`start ${id}`); await new Promise((r) => setTimeout(r, 5)); order.push(`end ${id}`); return id; };
  const results = await Promise.all([withCrossTabLock('x', task(1), { locks }), withCrossTabLock('x', task(2), { locks })]);
  assert.deepEqual(results, [1, 2]);
  assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2']);
});

test('without Web Locks a storage lease makes the second tab wait, then releases', async () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const order = [];
  const task = (id) => async () => { order.push(`start ${id}`); await new Promise((r) => setTimeout(r, 300)); order.push(`end ${id}`); };
  await Promise.all([
    withCrossTabLock('x', task(1), { storage, ownerId: 'tab-1' }),
    new Promise((r) => setTimeout(r, 20)).then(() => withCrossTabLock('x', task(2), { storage, ownerId: 'tab-2' })),
  ]);
  assert.deepEqual(order, ['start 1', 'end 1', 'start 2', 'end 2']);
  assert.equal(data.size, 0, 'lease released');
});
