/* global URL */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const h = React.createElement;
const modules = new Map();
let hookState = { query: {}, mutate: () => undefined };
function load(relative) {
  const url = new URL(relative, import.meta.url);
  if (modules.has(url.href)) return modules.get(url.href);
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = name => {
    if (name === './custom-client') return { customApiClient: {} };
    if (name === '../ui/button') return { Button: ({ children, disabled }) => h('button', { disabled }, children) };
    if (name === '@/hooks/queries/use-lesson-author-review') return {
      useLessonAuthorReviewItems: () => hookState.query,
      useResolveLessonAuthorReviewItem: () => ({ mutate: (...args) => hookState.mutate(...args) }),
    };
    if (name.startsWith('.')) {
      for (const extension of ['.ts', '.tsx']) {
        const next = new URL(`${name}${extension}`, url);
        if (existsSync(next)) return load(next.href);
      }
    }
    return require(name);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(url.href, module.exports);
  return module.exports;
}
const logic = load('./workspace-review.logic.ts');
const api = load('../../api/workspace-review.ts');
const { WorkspaceReviewPanel } = load('./workspace-review-panel.tsx');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { courseId: 'course-v1:N+R+2026', conversationId: id(1), workspaceId: id(2) };
const location = { chapter: { number: 2, title: 'An toàn điện' }, lesson: { number: 1, title: 'Đo lường' },
  unit: { number: 3, title: 'Đồng hồ vạn năng' }, component: null };
const item = (overrides = {}) => ({ obligation_id: id(10), status: 'open', decision: null, resolved_at: null, location,
  required_kind: 'single_choice', reason: 'ASSESSMENT_SOURCE_CHECK_REQUIRED', learning_objectives: ['Chọn dải đo đúng'],
  evidence_fact_count: 3, candidate_components: [], ...overrides });
const list = (items, counts = {}) => ({ workspace_id: id(2), review_required: true, total_count: items.length,
  open_count: items.filter(entry => entry.status === 'open').length, resolved_count: items.filter(entry => entry.status === 'resolved').length,
  has_more: false, items, ...counts });

test('a review-required run is "completed – waiting for review", never a failure', () => {
  assert.equal(logic.workspaceReviewRequired({ status: 'needs_action', failure_code: 'ASSESSMENT_REVIEW_REQUIRED' }), true);
  assert.equal(logic.workspaceReviewRequired({ status: 'needs_action', failure_code: 'ORCHESTRATION_V2_UNIT_FALLBACK_INVALID' }), false);
  assert.equal(logic.workspaceReviewRequired({ status: 'ready', failure_code: null }), false);
  assert.equal(logic.workspaceReviewRequired(null), false);
  assert.deepEqual(logic.workspaceReviewProgress({ total_count: 4, resolved_count: 1, open_count: 3 }),
    { total: 4, resolved: 1, open: 3, percent: 25, done: false });
  assert.equal(logic.workspaceReviewProgress({ total_count: 0, resolved_count: 0, open_count: 0 }).done, false);
  const pending = logic.workspaceReviewHeadline(logic.workspaceReviewProgress({ total_count: 2, resolved_count: 1, open_count: 1 }), 'vi');
  assert.deepEqual([pending.tone, pending.title], ['pending', 'Hoàn tất – chờ duyệt']);
  const done = logic.workspaceReviewHeadline(logic.workspaceReviewProgress({ total_count: 2, resolved_count: 2, open_count: 0 }), 'vi');
  assert.deepEqual([done.tone, done.title, done.note], ['done', 'Đã duyệt xong', null]);
  assert.equal(logic.workspaceReviewHeadline(logic.workspaceReviewProgress({ total_count: 1, resolved_count: 1, open_count: 0 }), 'en').title, 'Review complete');
});

test('an item says where, what to check and what was decided, in plain words', () => {
  const view = logic.workspaceReviewItemView(item({ candidate_components: [{ node_id: id(20), number: 2, title: 'Chọn dải đo' },
    { node_id: id(21), number: 3, title: null }] }), 'vi');
  assert.equal(view.where, 'Bài học «Đồng hồ vạn năng» (Chương 2)');
  assert.match(view.what, /tạm giữ một câu hỏi trắc nghiệm/);
  assert.deepEqual(view.candidates.map(candidate => candidate.label),
    ['Câu hỏi «Chọn dải đo» đã kiểm tra mục tiêu này', 'Câu hỏi «nội dung 3» đã kiểm tra mục tiêu này']);
  assert.equal(view.status, null);
  assert.equal(logic.workspaceReviewItemView(item({ status: 'resolved', decision: 'approved_replan' }), 'en').status,
    'Checked – the held question is not used');
  assert.equal(logic.workspaceReviewItemView(item({ location: null }), 'vi').where, 'Bài học chưa rõ vị trí');
  for (const locale of ['vi', 'en']) {
    for (const value of Object.values(logic.workspaceReviewCopy[locale])) {
      const text = typeof value === 'function' ? value(1, 2) : value;
      assert.doesNotMatch(text, /[A-Z][A-Z0-9]*_[A-Z0-9_]+|\b(obligation|workspace|replan|needs_action|hash)\b/i);
      if (locale === 'vi') assert.doesNotMatch(text, /\b(review|course|apply|draft|lesson)\b/i);
    }
  }
});

test('review API: strict list reader, exact URLs and plain error codes', async () => {
  assert.equal(api.readWorkspaceReviewList(list([item()]), id(2)).items[0].location.unit.title, 'Đồng hồ vạn năng');
  for (const broken of [list([item()], { open_count: 5 }), list([item({ status: 'resolved' })]), { ...list([]), workspace_id: id(9) },
    list([item({ obligation_id: 'x' })])]) {
    assert.throws(() => api.readWorkspaceReviewList(broken, id(2)), { code: 'WORKSPACE_REVIEW_READ_UNAVAILABLE' });
  }
  const calls = [];
  const transport = { get: async (url, config) => { calls.push({ url, config }); return { data: { data: list([item()]) } }; },
    post: async (url, body, config) => { calls.push({ url, body, config });
      return { data: { data: { obligation_id: id(10), decision: body.decision, status: 'resolved', replayed: false, open_count: 0, total_count: 1 } } }; } };
  await api.listWorkspaceReviewItems(scope, 'vi', undefined, transport);
  const receipt = await api.resolveWorkspaceReviewItem(scope, id(10), { decision: 'approved_replan', operation_id: id(30) }, 'en', transport);
  const base = `/api/ai-chatbot/chat/lesson-author/courses/${encodeURIComponent(scope.courseId)}/conversations/${id(1)}/workspaces/${id(2)}/review-items`;
  assert.deepEqual(calls.map(call => call.url), [base, `${base}/${id(10)}/resolve`]);
  assert.deepEqual(calls[1].body, { decision: 'approved_replan', operation_id: id(30) });
  assert.deepEqual(calls[0].config.params, { ui_locale: 'vi' });
  assert.deepEqual(receipt, { obligation_id: id(10), decision: 'approved_replan', replayed: false, open_count: 0, total_count: 1 });
  await assert.rejects(api.resolveWorkspaceReviewItem(scope, id(10), { decision: 'valid_assessment', operation_id: id(30) }, 'vi', transport),
    { code: 'WORKSPACE_REVIEW_INPUT_INVALID' });
  const refusing = { post: async () => { throw { response: { status: 409, data: { code: 'WORKSPACE_REVIEW_ALREADY_RESOLVED', message: 'raw' } } }; } };
  const error = await api.resolveWorkspaceReviewItem(scope, id(10), { decision: 'approved_replan', operation_id: id(30) }, 'vi', refusing)
    .catch(value => value);
  assert.equal(api.workspaceReviewErrorMessage(error, 'vi', 'resolve'), 'Mục này đã được duyệt rồi. Hãy tải lại danh sách để xem kết quả.');
  assert.equal(api.workspaceReviewErrorMessage(new Error('Provider text'), 'en', 'list'), 'The review list could not be loaded. Please try again in a few minutes.');
});

test('review panel: progress, items, actions only for people who can apply, then "review complete"', () => {
  const decisions = [];
  hookState = { query: { data: list([item({ candidate_components: [{ node_id: id(20), number: 2, title: 'Chọn dải đo' }] }),
    item({ obligation_id: id(11), status: 'resolved', decision: 'approved_replan', resolved_at: '2026-10-20T00:00:00.000Z' })]),
  isLoading: false, isError: false, isFetching: false, refetch: () => undefined }, mutate: variables => decisions.push(variables) };
  const html = renderToStaticMarkup(h(WorkspaceReviewPanel, { scope, tenantId: id(5), locale: 'vi', canResolve: true }));
  assert.match(html, /Hoàn tất – chờ duyệt/);
  assert.match(html, /Đã kiểm tra 1\/2 mục/);
  assert.match(html, /Bài học «Đồng hồ vạn năng» \(Chương 2\)/);
  assert.match(html, /Chọn dải đo đúng/);
  assert.match(html, /Đánh dấu đã kiểm tra/);
  assert.match(html, /Câu hỏi «Chọn dải đo» đã kiểm tra mục tiêu này/);
  assert.match(html, /Đã kiểm tra – không dùng câu hỏi AI tạm giữ/);
  assert.doesNotMatch(html, /ASSESSMENT|needs_action|obligation/);

  const viewer = renderToStaticMarkup(h(WorkspaceReviewPanel, { scope, tenantId: id(5), locale: 'vi', canResolve: false }));
  assert.doesNotMatch(viewer, /Đánh dấu đã kiểm tra</);
  assert.match(viewer, /Chỉ người được quyền áp dụng nội dung/);

  hookState = { ...hookState, query: { ...hookState.query, data: list([item({ status: 'resolved', decision: 'valid_assessment',
    resolved_at: '2026-10-20T00:00:00.000Z' })]) } };
  const finished = renderToStaticMarkup(h(WorkspaceReviewPanel, { scope, tenantId: id(5), locale: 'en', canResolve: true }));
  assert.match(finished, /Review complete/);
  assert.match(finished, /1 of 1 checked/);
  assert.match(finished, /Checked – an existing question in the lesson is used/);
  assert.doesNotMatch(finished, /Mark as checked/);

  hookState = { ...hookState, query: { isLoading: false, isError: true, isFetching: false, error: new Error('x'), refetch: () => undefined } };
  assert.match(renderToStaticMarkup(h(WorkspaceReviewPanel, { scope, tenantId: id(5), locale: 'vi', canResolve: true })),
    /Chưa thể tải danh sách chờ duyệt/);
});
