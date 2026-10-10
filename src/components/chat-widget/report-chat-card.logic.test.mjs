/* global URL, Buffer */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./report-chat-card.logic.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const logic = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

const TEAM = '00000000-0000-4000-8000-000000000105';

function snapshot(overrides = {}) {
  return {
    version: 2,
    generated_at: '2026-10-08T05:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh',
    filter: { date_from: '2026-07-01', date_to: '2026-07-31', team_id: TEAM },
    scope_display: { group_name: 'L&A Holdings', subgroup_name: 'Miền Nam - Kinh doanh', team_name: 'Marketing' },
    comparison: { date_from: '2026-06-01', date_to: '2026-06-30', basis: 'calendar_month' },
    factual_metrics: [],
    signals: [],
    signal_threshold_version: 'v1',
    summary: { overview: { total_learners: 3, active_learners: 1, completion_rate: 40, total_enrollments: 5 } },
    availability: { state: 'available', limitations: [] },
    ...overrides,
  };
}

function analysis(metadata = {}) {
  return logic.getReportChatAttachment({
    kind: 'report_analysis',
    report_question: 'Báo cáo team Marketing tháng 7',
    report_filter: { date_from: '2026-07-01', date_to: '2026-07-31', team_id: TEAM },
    report_snapshot: snapshot(),
    report_narrative: {
      selected_signal_ids: ['completion_decline'],
      interpretation: ['Hoạt động học giảm ở cuối kỳ.'],
      recommended_actions: [{ signal_id: 'completion_decline', priority: 'high', action: 'Nhắc học viên chưa hoàn thành.' }],
      limitations: ['completion_decline_insufficient_sample:v1', 'internal_debug_code', 'Dữ liệu tuần cuối còn ít.'],
    },
    report_request: { period_source: 'agreed', unit_source: 'question' },
    ...metadata,
  });
}

test('parses an analysis message with its request context and narrative', () => {
  const attachment = analysis();
  assert.equal(attachment.kind, 'analysis');
  assert.deepEqual(attachment.request, { period_source: 'agreed' });
  assert.equal(attachment.narrative.recommended_actions[0].priority, 'high');
  assert.equal(attachment.hasData, true);
});

test('applied-filter chips show the period, each unit level and the course', () => {
  const chips = logic.buildReportAppliedChips(analysis(), false);
  assert.deepEqual(chips, [
    { kind: 'period', label: '01/07/2026 – 31/07/2026', isDefault: false, clampedToToday: false },
    { kind: 'unit', level: 'group', name: 'L&A Holdings' },
    { kind: 'unit', level: 'subgroup', name: 'Miền Nam - Kinh doanh' },
    { kind: 'unit', level: 'team', name: 'Marketing' },
  ]);
  const english = logic.buildReportAppliedChips(analysis(), true);
  assert.equal(english[0].label, '01 Jul 2026 – 31 Jul 2026');
});

test('applied-filter chips mark a default period and an "all units" scope', () => {
  const attachment = analysis({
    report_snapshot: snapshot({ scope_display: {}, course_detail: { course_id: 'c1', name: 'An toàn lao động', total_enrollments: 1, completed_enrollments: 0, incomplete_enrollments: 1, not_started_enrollments: 1, in_progress_enrollments: 0, completion_rate: 0 } }),
    report_request: { period_source: 'default', clamped_to_today: true },
  });
  assert.deepEqual(logic.buildReportAppliedChips(attachment, false), [
    { kind: 'period', label: '01/07/2026 – 31/07/2026', isDefault: true, clampedToToday: true },
    { kind: 'all_units' },
    { kind: 'course', name: 'An toàn lao động' },
  ]);
});

test('the narrative view keeps AI text, translates known codes and hides unknown codes', () => {
  const view = logic.getReportNarrativeView(analysis().narrative);
  assert.deepEqual(view, {
    interpretation: ['Hoạt động học giảm ở cuối kỳ.'],
    actions: [{ priority: 'high', text: 'Nhắc học viên chưa hoàn thành.' }],
    limitations: [{ kind: 'known', key: 'smallSample' }, { kind: 'text', text: 'Dữ liệu tuần cuối còn ít.' }],
  });
  assert.equal(logic.getReportNarrativeView({ selected_signal_ids: [], interpretation: [], recommended_actions: [], limitations: ['internal_code'] }), null);
  assert.equal(logic.getReportNarrativeView(null), null);
});

test('the empty state explains the period and offers the nearest month with data', () => {
  const attachment = analysis({
    report_snapshot: snapshot({
      summary: { overview: { total_learners: 0, active_learners: 0, completion_rate: 0, total_enrollments: 0 } },
      availability: { state: 'empty', limitations: ['no_data_in_selected_period'], nearest_data_period: { date_from: '2026-08-01', date_to: '2026-08-31', direction: 'after' } },
    }),
  });
  assert.deepEqual(logic.getReportEmptyState(attachment, false), {
    reason: 'no_data',
    period: '01/07/2026 – 31/07/2026',
    nearest: {
      filter: { date_from: '2026-08-01', date_to: '2026-08-31', team_id: TEAM },
      label: '01/08/2026 – 31/08/2026',
      direction: 'after',
    },
  });
  assert.equal(logic.getReportEmptyState(analysis(), false), null);
  const noScope = analysis({ report_snapshot: snapshot({ availability: { state: 'no_accessible_scope', limitations: [] } }) });
  assert.equal(logic.getReportEmptyState(noScope, false).reason, 'no_scope');
});

test('parses a clarification message and drops malformed options and unknown reasons', () => {
  const attachment = logic.getReportChatAttachment({
    kind: 'report_clarification',
    report_question: 'Báo cáo nhóm Kinh doanh tháng 7',
    report_suggested_filter: { date_from: '2026-07-01', date_to: '2026-07-31' },
    report_clarification: {
      version: 1,
      reasons: ['unit_ambiguous', 'something_new'],
      params: { mention: 'Kinh doanh' },
      options: [
        { id: 'option-1', filter: { date_from: '2026-07-01', date_to: '2026-07-31', team_id: TEAM }, period: { date_from: '2026-07-01', date_to: '2026-07-31' }, unit: { id: TEAM, level: 'team', name: 'Kinh doanh Hà Nội', path: ['L&A Holdings', 'Miền Bắc - Kinh doanh'] } },
        { id: 'option-2', filter: {} },
        'broken',
      ],
    },
  });
  assert.equal(attachment.kind, 'clarification');
  assert.deepEqual(attachment.clarification.reasons, ['unit_ambiguous']);
  assert.equal(attachment.clarification.options.length, 1);
  assert.deepEqual(logic.getReportClarificationOptions(attachment.clarification, false), [{
    id: 'option-1',
    filter: { date_from: '2026-07-01', date_to: '2026-07-31', team_id: TEAM },
    unit: { name: 'Kinh doanh Hà Nội', level: 'team', path: 'L&A Holdings / Miền Bắc - Kinh doanh' },
    period: '01/07/2026 – 31/07/2026',
    allScope: false,
  }]);
  assert.equal(logic.getReportClarificationReasonKey('unit_forbidden', {}), 'unit_forbidden_generic');
  assert.equal(logic.getReportClarificationReasonKey('unit_forbidden', { unit_name: 'Marketing' }), 'unit_forbidden');
  assert.equal(logic.getReportClarificationReasonKey('date_conflict', {}), 'date_conflict');
});

test('legacy messages keep working: filter requests and applied-filter bubbles', () => {
  assert.deepEqual(logic.getReportChatAttachment({ kind: 'report_filter_request', report_question: 'Báo cáo', report_suggested_filter: { date_from: '2026-07-01', date_to: '2026-07-31' } }), {
    kind: 'filter', question: 'Báo cáo', suggestedFilter: { date_from: '2026-07-01', date_to: '2026-07-31' },
  });
  assert.equal(logic.getReportChatAttachment({ kind: 'report_analysis' }), null);
  assert.deepEqual(logic.getReportChatAppliedFilter({ report_filters: { date_from: '2026-07-01', date_to: '2026-07-31', team_id: TEAM } }), {
    date_from: '2026-07-01', date_to: '2026-07-31', team_id: TEAM,
  });
  assert.equal(logic.getReportChatAppliedFilter({ report_filters: { date_from: '2026-07-01' } }), null);
});

function count(id, current, previous) {
  const delta = previous === null ? null : current - previous;
  return {
    id,
    unit: 'count',
    current,
    previous,
    delta_absolute: delta,
    delta_percent: previous ? Math.round((delta / previous) * 10_000) / 100 : null,
    delta_percentage_points: null,
  };
}

function rate(current, previous) {
  const delta = previous === null ? null : Math.round((current - previous) * 100) / 100;
  return { id: 'completion_rate', unit: 'percentage', current, previous, delta_absolute: delta, delta_percent: null, delta_percentage_points: delta };
}

test('a count keeps its absolute change and gets the note when the PDF would hide its percentage', () => {
  assert.deepEqual(logic.REPORT_CHANGE_RULE, { percentMinimumBase: 10, percentMaximum: 300, rateMinimumEnrollments: 10 });
  // 47 -> 421 is +795.7 %: above +300 %, so only "+374" and the note.
  assert.deepEqual(logic.getReportMetricChange(count('total_enrollments', 421, 47), null), { difference: 374, note: 'smallBaseCount' });
  assert.deepEqual(logic.getReportMetricChange(count('active_learners', 20, 9), null), { difference: 11, note: 'smallBaseCount' }, 'comparison value below 10');
  assert.deepEqual(logic.getReportMetricChange(count('active_learners', 5, 0), null), { difference: 5, note: 'smallBaseCount' }, 'nothing to compare with');
  assert.deepEqual(logic.getReportMetricChange(count('total_enrollments', 40, 10), null), { difference: 30, note: null }, 'exactly +300 %');
  assert.deepEqual(logic.getReportMetricChange(count('total_enrollments', 41, 10), null), { difference: 31, note: 'smallBaseCount' }, '+310 %');
  assert.deepEqual(logic.getReportMetricChange(count('total_learners', 120, 100), null), { difference: 20, note: null });
  assert.deepEqual(logic.getReportMetricChange(count('total_learners', 50, 100), null), { difference: -50, note: null }, 'a drop is never above +300 %');
  assert.deepEqual(logic.getReportMetricChange(count('active_learners', 4, 4), null), { difference: 0, note: null }, 'no change, no note');
  assert.deepEqual(logic.getReportMetricChange(count('total_learners', 7, null), null), { difference: null, note: null }, 'no comparison period');
});

test('the completion rate is compared only when both periods have 10 enrollments', () => {
  assert.deepEqual(logic.getReportMetricChange(rate(67.1, 58.2), count('total_enrollments', 421, 47)), { difference: 8.9, note: null });
  assert.deepEqual(logic.getReportMetricChange(rate(67.1, 58.2), count('total_enrollments', 421, 9)), { difference: null, note: 'smallBaseRate' });
  assert.deepEqual(logic.getReportMetricChange(rate(40, 80), count('total_enrollments', 9, 30)), { difference: null, note: 'smallBaseRate' });
  assert.deepEqual(logic.getReportMetricChange(rate(40, 80), count('total_enrollments', 10, 10)), { difference: -40, note: null });
  assert.deepEqual(logic.getReportMetricChange(rate(40, null), count('total_enrollments', 3, null)), { difference: null, note: null }, 'no comparison period');
});
