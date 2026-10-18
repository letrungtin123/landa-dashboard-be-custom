import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const unitEditor = readFileSync(new URL('./UnitEditor.tsx', import.meta.url), 'utf8');

test('component preview loads share one query key, always ask the server and keep nothing cached', () => {
  const helper = unitEditor.slice(unitEditor.indexOf('function loadSharedBlockDetail('), unitEditor.indexOf('// ─── UnitEditor (main)'));
  assert.match(helper, /queryKey: \['course-block-detail', block\.id \|\| block\.block_id\]/);
  assert.match(helper, /staleTime: 0,/);
  assert.match(helper, /gcTime: 0,/);
  assert.match(unitEditor, /const detail = await loadSharedBlockDetail\(queryClient, block\);/);
  // The editor form keeps its own fresh copy, never the preview object.
  assert.match(unitEditor, /const currentBlock = await fetchBlockDetail\(block\);/);
});

test('an AI ID Apply on this course refreshes the open unit (queries no longer refetch on tab focus)', () => {
  assert.match(unitEditor, /window\.addEventListener\('landa:course-outline-updated', handleCourseOutlineUpdated\)/);
  assert.match(unitEditor, /if \(detail\?\.courseId === courseId\) void refetch\(\);/);
  assert.match(unitEditor, /window\.removeEventListener\('landa:course-outline-updated', handleCourseOutlineUpdated\)/);
});
