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

test('an Apply holds the workspace until it settles; a second click meanwhile is never sent', async () => {
  const flights = createWorkspaceApplyFlights();
  const post = deferred(), events = [];
  const first = runWorkspaceApplyFlight({ flights, workspaceId: id(1), nodeId: id(10),
    send: () => { events.push('send 1'); return post.promise; },
    applied: result => events.push(['applied', result, flights.get(id(1))]),
    failed: () => events.push('failed'), reload: () => events.push('reload') });
  assert.equal(flights.get(id(1))?.nodeId, id(10), 'held while the request runs');
  assert.equal(await runWorkspaceApplyFlight({ flights, workspaceId: id(1), nodeId: id(11),
    send: async () => { events.push('send 2'); }, applied: () => events.push('applied 2'), failed: () => events.push('failed 2'),
    reload: () => events.push('reload 2') }), 'busy');
  post.resolve('receipt');
  assert.equal(await first, 'applied');
  assert.deepEqual(events, ['send 1', ['applied', 'receipt', null]], 'released before the outcome is shown; success reloads through completeWorkspaceApplyUi');
  assert.equal(flights.get(id(1)), null);
});

test('a changed draft or course reloads the workspace read so the next Apply sends the fresh head; other failures do not', async () => {
  const conflict = new WorkspaceApplyError('WORKSPACE_APPLY_CONFLICT', 'rejected');
  assert.equal(workspaceApplyFailureNeedsReload(conflict), true);
  for (const error of [new WorkspaceApplyError('WORKSPACE_APPLY_COURSE_BUSY', 'rejected'), new WorkspaceApplyError('WORKSPACE_APPLY_VALIDATION_FAILED', 'rejected'),
    new WorkspaceApplyError('WORKSPACE_APPLY_UNAVAILABLE', 'unknown'), new WorkspaceWriteError('WORKSPACE_EDIT_READ_REQUIRED'), new Error('network')]) {
    assert.equal(workspaceApplyFailureNeedsReload(error), false, String(error.code ?? error.message));
  }
  for (const [error, reloads] of [[conflict, 1], [new WorkspaceApplyError('WORKSPACE_APPLY_COURSE_BUSY', 'rejected'), 0], [new Error('network'), 0]]) {
    const flights = createWorkspaceApplyFlights(), events = [];
    const result = await runWorkspaceApplyFlight({ flights, workspaceId: id(1), nodeId: id(10),
      send: async () => { throw error; }, applied: () => events.push('applied'),
      failed: failure => events.push(['failed', failure, flights.get(id(1))]), reload: () => events.push(['reload', flights.get(id(1))]) });
    assert.equal(result, 'failed');
    assert.deepEqual(events, [['failed', error, null], ...Array.from({ length: reloads }, () => ['reload', null])]);
    assert.equal(flights.get(id(1)), null, 'a failed Apply frees the workspace');
  }
  // A request that cannot even start (thrown before any promise) frees the workspace too.
  const flights = createWorkspaceApplyFlights();
  assert.equal(await runWorkspaceApplyFlight({ flights, workspaceId: id(1), nodeId: id(10),
    send: () => { throw new WorkspaceWriteError('WORKSPACE_EDIT_FORBIDDEN'); }, applied() {}, failed() {}, reload() {} }), 'failed');
  assert.equal(flights.get(id(1)), null);
});

test('the node dialog runs every Apply through the page-wide flight and reloads after success and conflict', () => {
  const dialog = readFileSync(new URL('./workspace-course-node-dialog.tsx', import.meta.url), 'utf8');
  assert.match(dialog, /const applying = useWorkspaceApplyFlight\(state\.launch\?\.workspace_id \?\? null\);/);
  assert.match(dialog, /await runWorkspaceApplyFlight\(\{ flights: workspaceApplyFlights, workspaceId: launch\.workspace_id, nodeId: node\.node_id,/);
  assert.match(dialog, /refreshWorkspace: \(\) => session\.refreshForApply\(\)/, 'a committed Apply reloads the workspace (the node turns green)');
  assert.match(dialog, /reload: \(\) => act\(\(\) => session\.refreshForApply\(\)\)/, 'a conflict reloads it, failures shown');
  assert.match(dialog, /disabled=\{!!applying\}/);
  assert.match(dialog, /applyDisabled=\{!canApply \|\| !!applying\}/);
  assert.doesNotMatch(dialog, /setApplyState\('busy'\)|applyState === 'busy'/, 'the running state is never local to one dialog');
  assert.doesNotMatch(dialog, /useState|localStorage|sessionStorage/);
});
