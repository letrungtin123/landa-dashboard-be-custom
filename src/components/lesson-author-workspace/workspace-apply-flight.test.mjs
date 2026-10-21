/* global URL */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// One Apply per workspace at a time in the page, kept across closing and
// reopening the dialogs, and the reload that gives the next Apply a fresh head.
const require = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const url = new URL(relative, import.meta.url);
  if (modules.has(url.href)) return modules.get(url.href);
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (name === './custom-client') return { customApiClient: {} };
    if (name.startsWith('.')) {
      const tsUrl = new URL(name + '.ts', url), tsxUrl = new URL(name + '.tsx', url);
      return load((existsSync(tsUrl) ? tsUrl : tsxUrl).href);
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(url.href, module.exports);
  return module.exports;
}
const { createWorkspaceApplyFlights, runWorkspaceApplyFlight, useWorkspaceApplyFlight, workspaceApplyFailureNeedsReload } = load('./workspace-apply-flight.ts');
const { WorkspaceApplyError } = load('../../api/workspace-apply.ts');
const { WorkspaceWriteError } = load('../../api/workspace-write.ts');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };

test('one Apply per workspace: a second one is refused while it runs, other workspaces are independent', () => {
  const flights = createWorkspaceApplyFlights();
  const seen = [];
  const unsubscribe = flights.subscribe(() => seen.push(flights.get(id(1))?.nodeId ?? null));
  const release = flights.begin(id(1), id(10));
  assert.equal(typeof release, 'function');
  const running = flights.get(id(1));
  assert.deepEqual(running, { workspaceId: id(1), nodeId: id(10) });
  assert.ok(Object.isFrozen(running));
  assert.equal(flights.get(id(1)), running, 'same object while it runs (stable store snapshot)');
  assert.equal(flights.begin(id(1), id(11)), null, 'another chapter of the same workspace waits');
  assert.equal(flights.begin(id(1), id(10)), null, 'the same chapter is never sent twice');
  const other = flights.begin(id(2), id(20));
  assert.equal(typeof other, 'function', 'another workspace is not blocked by the page');
  release();
  assert.equal(flights.get(id(1)), null);
  const next = flights.begin(id(1), id(11));
  assert.equal(typeof next, 'function', 'free again once it settled');
  release();
  assert.equal(flights.get(id(1))?.nodeId, id(11), 'a stale release never ends a newer Apply');
  next(); next(); other();
  unsubscribe();
  assert.deepEqual(seen, [id(10), id(10), null, id(11), null, null]);
  assert.equal(flights.begin(id(1), id(12)) !== null, true); // listeners gone: no throw, no record
  assert.equal(seen.length, 6);
});

test('the hook reads the running Apply of its workspace on every render, also on the server', () => {
  const flights = createWorkspaceApplyFlights();
  const h = React.createElement;
  const Probe = ({ workspaceId }) => h('span', null, useWorkspaceApplyFlight(workspaceId, flights)?.nodeId ?? 'idle');
  assert.equal(renderToStaticMarkup(h(Probe, { workspaceId: id(1) })), '<span>idle</span>');
  const release = flights.begin(id(1), id(10));
  assert.equal(renderToStaticMarkup(h(Probe, { workspaceId: id(1) })), `<span>${id(10)}</span>`);
  assert.equal(renderToStaticMarkup(h(Probe, { workspaceId: id(2) })), '<span>idle</span>');
  assert.equal(renderToStaticMarkup(h(Probe, { workspaceId: null })), '<span>idle</span>');
  release();
  assert.equal(renderToStaticMarkup(h(Probe, { workspaceId: id(1) })), '<span>idle</span>');
});

// Fake one-shot timer: the test decides when the reload bound expires.
function fakeTimer() {
  const timers = [];
  return { timers, start(ms, expired) { const entry = { ms, expired, cancelled: false }; timers.push(entry); return () => { entry.cancelled = true; }; } };
}
async function settle() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
const noop = () => {};

test('a committed Apply holds the workspace until the reload after it has settled; a second Apply meanwhile is never sent', async () => {
  const flights = createWorkspaceApplyFlights(), timer = fakeTimer();
  const post = deferred(), reload = deferred(), events = [];
  let finished = null;
  const first = runWorkspaceApplyFlight({ flights, timer, workspaceId: id(1), nodeId: id(10),
    send: () => { events.push('send 1'); return post.promise; },
    applied: result => { events.push(['applied', result, flights.get(id(1))?.nodeId]); return reload.promise; },
    failed: () => events.push('failed'), reload: async () => { events.push('conflict reload'); }, reloadFailed: () => events.push('reload failed') })
    .then(result => { finished = result; });
  assert.equal(flights.get(id(1))?.nodeId, id(10), 'held while the request runs');
  post.resolve('receipt'); await settle();
  assert.deepEqual(events, ['send 1', ['applied', 'receipt', id(10)]], 'the result is shown as soon as the answer arrives');
  assert.equal(flights.get(id(1))?.nodeId, id(10), 'still held while the workspace reload runs');
  assert.equal(finished, null);
  assert.deepEqual(timer.timers.map(entry => entry.ms), [15_000], 'the wait for the reload is bounded');
  // Another chapter clicked during the reload: refused here, nothing is sent with the old head.
  assert.equal(await runWorkspaceApplyFlight({ flights, timer, workspaceId: id(1), nodeId: id(11),
    send: async () => { events.push('send 2'); }, applied: async () => { events.push('applied 2'); }, failed: () => events.push('failed 2'),
    reload: async () => {}, reloadFailed: noop }), 'busy');
  reload.resolve(); await first;
  assert.equal(finished, 'applied');
  assert.equal(flights.get(id(1)), null, 'released once the reload settled');
  assert.equal(timer.timers[0].cancelled, true, 'the bound is cleared');
  assert.deepEqual(events, ['send 1', ['applied', 'receipt', id(10)]]);
});

test('a failed reload still frees the workspace and is shown; so does a reload that throws before it starts', async () => {
  for (const start of ['rejects', 'throws']) {
    const flights = createWorkspaceApplyFlights(), timer = fakeTimer(), reload = deferred(), shown = [];
    const failure = new Error('read failed');
    const run = runWorkspaceApplyFlight({ flights, timer, workspaceId: id(1), nodeId: id(10), send: async () => 'receipt',
      applied: () => { if (start === 'throws') throw failure; return reload.promise; },
      failed: noop, reload: async () => {}, reloadFailed: error => shown.push([error, flights.get(id(1))?.nodeId ?? null]) });
    await settle();
    if (start === 'rejects') { assert.equal(flights.get(id(1))?.nodeId, id(10), 'held while the reload runs'); reload.reject(failure); }
    assert.equal(await run, 'applied', 'the Apply itself committed');
    assert.deepEqual(shown, [[failure, id(10)]], start);
    assert.equal(flights.get(id(1)), null, start);
  }
});

test('a reload that hangs is waited for at most the bound; the workspace is freed and a late failure is still shown', async () => {
  const flights = createWorkspaceApplyFlights(), timer = fakeTimer(), reload = deferred(), shown = [];
  const run = runWorkspaceApplyFlight({ flights, timer, workspaceId: id(1), nodeId: id(10), send: async () => 'receipt',
    applied: () => reload.promise, failed: noop, reload: async () => {}, reloadFailed: error => shown.push(error) });
  await settle();
  assert.equal(flights.get(id(1))?.nodeId, id(10));
  timer.timers[0].expired();
  assert.equal(await run, 'applied');
  assert.equal(flights.get(id(1)), null, 'every Apply button is usable again after the bound');
  const late = new Error('late');
  reload.reject(late); await settle();
  assert.deepEqual(shown, [late]);
  assert.equal(flights.get(id(1)), null, 'a late answer never claims the workspace again');
});

test('a changed draft or course reloads the workspace read while the workspace stays held; other failures do not reload', async () => {
  const conflict = new WorkspaceApplyError('WORKSPACE_APPLY_CONFLICT', 'rejected');
  assert.equal(workspaceApplyFailureNeedsReload(conflict), true);
  for (const error of [new WorkspaceApplyError('WORKSPACE_APPLY_COURSE_BUSY', 'rejected'), new WorkspaceApplyError('WORKSPACE_APPLY_VALIDATION_FAILED', 'rejected'),
    new WorkspaceApplyError('WORKSPACE_APPLY_UNAVAILABLE', 'unknown'), new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED'), new Error('network')]) {
    assert.equal(workspaceApplyFailureNeedsReload(error), false, String(error.code ?? error.message));
  }
  // Conflict: the error is shown at once; the workspace stays held until the reload settled.
  const flights = createWorkspaceApplyFlights(), timer = fakeTimer(), reload = deferred(), events = [];
  const run = runWorkspaceApplyFlight({ flights, timer, workspaceId: id(1), nodeId: id(10),
    send: async () => { throw conflict; }, applied: async () => { events.push('applied'); },
    failed: failure => events.push(['failed', failure, flights.get(id(1))?.nodeId]),
    reload: () => { events.push(['reload', flights.get(id(1))?.nodeId]); return reload.promise; }, reloadFailed: noop });
  await settle();
  assert.deepEqual(events, [['failed', conflict, id(10)], ['reload', id(10)]]);
  assert.equal(await runWorkspaceApplyFlight({ flights, timer, workspaceId: id(1), nodeId: id(11), send: async () => { events.push('send 2'); },
    applied: async () => {}, failed: noop, reload: async () => {}, reloadFailed: noop }), 'busy', 'nothing is sent during the reload');
  reload.resolve();
  assert.equal(await run, 'failed');
  assert.equal(flights.get(id(1)), null);
  assert.equal(events.length, 2);
  // Other failures free the workspace at once, without a reload.
  for (const error of [new WorkspaceApplyError('WORKSPACE_APPLY_COURSE_BUSY', 'rejected'), new Error('network')]) {
    const own = createWorkspaceApplyFlights(), seen = [];
    assert.equal(await runWorkspaceApplyFlight({ flights: own, timer: fakeTimer(), workspaceId: id(1), nodeId: id(10),
      send: async () => { throw error; }, applied: async () => { seen.push('applied'); }, failed: failure => seen.push(failure),
      reload: async () => { seen.push('reload'); }, reloadFailed: noop }), 'failed');
    assert.deepEqual(seen, [error]);
    assert.equal(own.get(id(1)), null);
  }
  // A request that cannot even start (thrown before any promise) frees the workspace too.
  const own = createWorkspaceApplyFlights();
  assert.equal(await runWorkspaceApplyFlight({ flights: own, workspaceId: id(1), nodeId: id(10),
    send: () => { throw new WorkspaceWriteError('WORKSPACE_EDIT_FORBIDDEN'); }, applied: async () => {}, failed: noop,
    reload: async () => {}, reloadFailed: noop }), 'failed');
  assert.equal(own.get(id(1)), null);
});

test('the node dialog runs every Apply through the page-wide flight and waits for the reload after success and conflict', () => {
  const dialog = readFileSync(new URL('./workspace-course-node-dialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /const applying = useWorkspaceApplyFlight\(state\.launch\?\.workspace_id \?\? null\);/);
  assert.match(dialog, /await runWorkspaceApplyFlight\(\{ flights: workspaceApplyFlights, workspaceId: launch\.workspace_id, nodeId: node\.node_id,/);
  assert.match(dialog, /return completeWorkspaceApplyUi\(\{ markApplied:/, 'the flight waits for the success reload');
  assert.match(dialog, /refreshWorkspace: \(\) => session\.refreshForApply\(\)/, 'a committed Apply reloads the workspace (the node turns green)');
  assert.match(dialog, /reload: \(\) => session\.refreshForApply\(\),\s*reloadFailed: \(\) => setActionError\(true\),/,
    'a conflict reloads it; a failed reload shows the usual error');
  assert.match(dialog, /disabled=\{!!applying\}/);
  assert.match(dialog, /applyDisabled=\{!canApply \|\| !!applying\}/);
  assert.doesNotMatch(dialog, /setApplyState\('busy'\)|applyState === 'busy'/, 'the running state is never local to one dialog');
  assert.doesNotMatch(dialog, /useState|localStorage|sessionStorage/);
});
