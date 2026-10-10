/* global URL, Buffer */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

async function importEsm(path) {
  const output = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}

const { vi } = await importEsm('../../i18n/locales/vi.ts');
const viUrl = `data:text/javascript;base64,${Buffer.from(ts.transpileModule(read('../../i18n/locales/vi.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const enSource = ts.transpileModule(read('../../i18n/locales/en.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace(/from\s+["']\.\/vi["']/, `from "${viUrl}"`);
const { en } = await import(`data:text/javascript;base64,${Buffer.from(enSource).toString('base64')}`);

function translator(dictionary) {
  return (key, params = {}) => {
    const value = key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dictionary);
    if (typeof value !== 'string') return key;
    return value.replace(/\{\{(\w+)\}\}/g, (_match, name) => String(params[name] ?? ''));
  };
}

function loadCommonJs(path, modules) {
  const output = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(output, { exports, require: (name) => (name in modules ? modules[name] : require(name)) });
  return exports;
}

const logic = loadCommonJs('./report-chat-card.logic.ts', {});

/** Props without the ones a stub does not pass to the DOM (variant, size, motion props). */
const omitProps = (props, names) => Object.fromEntries(Object.entries(props).filter(([name]) => !names.includes(name)));
const Button = ({ children, ...props }) => React.createElement('button', omitProps(props, ['variant', 'size']), children);

function components(dictionary) {
  const modules = {
    'react-i18next': { useTranslation: () => ({ t: translator(dictionary) }) },
    '@/components/ui/button': { Button },
    './report-chat-card.logic': logic,
  };
  return {
    ...loadCommonJs('./report-chat-applied-filters.tsx', modules),
    ...loadCommonJs('./report-chat-narrative.tsx', modules),
    ...loadCommonJs('./report-chat-empty-state.tsx', modules),
    ...loadCommonJs('./report-chat-clarification.tsx', modules),
  };
}

const unitLabels = { group: 'Công ty', subgroup: 'Chi nhánh', team: 'Phòng ban' };
const noop = () => undefined;

function assertTranslated(html) {
  assert.doesNotMatch(html, /chatWidget\./, 'every visible string must come from vi.ts / en.ts');
}

test('applied-filter chips render period and units as editable buttons and the course as text', () => {
  for (const [dictionary, period, edit] of [[vi, 'mặc định', 'Sửa bộ lọc'], [en, 'default', 'Edit filter']]) {
    const { ReportAppliedFilterChips } = components(dictionary);
    const html = renderToStaticMarkup(React.createElement(ReportAppliedFilterChips, {
      chips: [
        { kind: 'period', label: '01/07/2026 – 31/07/2026', isDefault: true, clampedToToday: false },
        { kind: 'unit', level: 'team', name: 'Marketing' },
        { kind: 'course', name: 'An toàn lao động' },
      ],
      unitLabels,
      onEdit: noop,
    }));
    assertTranslated(html);
    assert.equal((html.match(/<button/g) || []).length, 2);
    assert.match(html, new RegExp(`01/07/2026 – 31/07/2026 · ${period}`));
    assert.match(html, /Phòng ban: Marketing/);
    assert.match(html, new RegExp(`aria-label="${edit}: Phòng ban: Marketing"`));
    assert.match(html, /An toàn lao động/);
  }
});

test('the stored AI narrative is displayed with priorities and translated limitation codes', () => {
  const view = {
    interpretation: ['Hoạt động học giảm ở cuối kỳ.'],
    actions: [{ priority: 'high', text: 'Nhắc học viên chưa hoàn thành.' }],
    limitations: [{ kind: 'known', key: 'smallSample' }],
  };
  const viHtml = renderToStaticMarkup(React.createElement(components(vi).ReportNarrativePanel, { view }));
  assertTranslated(viHtml);
  assert.match(viHtml, /Nhận định từ AI/);
  assert.match(viHtml, /Ưu tiên cao/);
  assert.match(viHtml, /Hoạt động học giảm ở cuối kỳ\./);
  assert.match(viHtml, /chưa đủ cơ sở đánh giá xu hướng/);
  const enHtml = renderToStaticMarkup(React.createElement(components(en).ReportNarrativePanel, { view }));
  assertTranslated(enHtml);
  assert.match(enHtml, /AI insight/);
  assert.match(enHtml, /High priority/);
  assert.match(enHtml, /too few enrollments/);
});

test('the empty state explains the range and offers the nearest period and a change-range shortcut', () => {
  const view = {
    reason: 'no_data',
    period: '01/07/2026 – 31/07/2026',
    nearest: { filter: { date_from: '2026-08-01', date_to: '2026-08-31' }, label: '01/08/2026 – 31/08/2026', direction: 'after' },
  };
  const viHtml = renderToStaticMarkup(React.createElement(components(vi).ReportEmptyStatePanel, { view, onUseNearest: noop, onChangeRange: noop }));
  assertTranslated(viHtml);
  assert.match(viHtml, /Không có dữ liệu trong khoảng này/);
  assert.match(viHtml, /trong 01\/07\/2026 – 31\/07\/2026 thuộc phạm vi đã chọn/);
  assert.match(viHtml, /Dữ liệu gần nhất sau đó: 01\/08\/2026 – 31\/08\/2026/);
  assert.match(viHtml, /Xem 01\/08\/2026 – 31\/08\/2026/);
  assert.match(viHtml, /Đổi khoảng thời gian/);
  const enHtml = renderToStaticMarkup(React.createElement(components(en).ReportEmptyStatePanel, { view: { ...view, nearest: null }, onUseNearest: noop, onChangeRange: noop }));
  assertTranslated(enHtml);
  assert.match(enHtml, /No data in this period/);
  assert.match(enHtml, /Change the period/);
  assert.equal((enHtml.match(/<button/g) || []).length, 1);
  const noScope = renderToStaticMarkup(React.createElement(components(vi).ReportEmptyStatePanel, { view: { reason: 'no_scope', period: null, nearest: null }, onUseNearest: noop, onChangeRange: noop }));
  assert.match(noScope, /chưa có phạm vi tổ chức được phép xem/);
});

test('a clarification renders localized reasons and one chip per option', () => {
  const clarification = {
    version: 1,
    reasons: ['unit_forbidden', 'date_future'],
    params: { unit_name: 'Marketing' },
    options: [
      { id: 'option-1', filter: { date_from: '2025-11-01', date_to: '2025-11-30', group_id: 'g1' }, period: { date_from: '2025-11-01', date_to: '2025-11-30' }, unit: { id: 'g1', level: 'group', name: 'Nesso', path: [] } },
      { id: 'option-2', filter: { date_from: '2025-11-01', date_to: '2025-11-30' }, period: { date_from: '2025-11-01', date_to: '2025-11-30' }, all_scope: true },
    ],
  };
  const props = { clarification, fallback: 'fallback', unitLabels, onChoose: noop, onOpenFilters: noop };
  const viHtml = renderToStaticMarkup(React.createElement(components(vi).ReportClarificationPanel, { ...props, isEnglish: false }));
  assertTranslated(viHtml);
  assert.match(viHtml, /Bạn không có quyền xem báo cáo của “Marketing”\./);
  assert.match(viHtml, /Khoảng thời gian này của năm nay chưa diễn ra\./);
  assert.match(viHtml, /Công ty: Nesso/);
  assert.match(viHtml, /Toàn bộ phạm vi/);
  assert.match(viHtml, /01\/11\/2025 – 30\/11\/2025/);
  assert.match(viHtml, /Chọn bộ lọc khác/);
  assert.equal((viHtml.match(/<button/g) || []).length, 3);
  const enHtml = renderToStaticMarkup(React.createElement(components(en).ReportClarificationPanel, { ...props, isEnglish: true }));
  assertTranslated(enHtml);
  assert.match(enHtml, /You do not have access to reports for “Marketing”\./);
  assert.match(enHtml, /01 Nov 2025 – 30 Nov 2025/);
  assert.match(enHtml, /aria-label="Analyze report: Công ty: Nesso · 01 Nov 2025 – 30 Nov 2025"/);
  const unknown = renderToStaticMarkup(React.createElement(components(en).ReportClarificationPanel, { ...props, clarification: { ...clarification, reasons: [] }, isEnglish: true }));
  assert.match(unknown, /fallback/);
});

test('every clarification reason has Vietnamese and English text', () => {
  const reasons = ['date_conflict', 'date_invalid', 'date_reversed', 'date_too_long', 'date_multiple', 'date_future', 'date_open',
    'unit_ambiguous', 'unit_ambiguous_generic', 'unit_not_found', 'unit_not_found_generic', 'unit_forbidden', 'unit_forbidden_generic', 'unit_multiple', 'scope_required'];
  for (const reason of reasons) {
    assert.ok(vi.chatWidget.report.clarification.reasons[reason], `vi ${reason}`);
    assert.ok(en.chatWidget.report.clarification.reasons[reason], `en ${reason}`);
    assert.notEqual(vi.chatWidget.report.clarification.reasons[reason], en.chatWidget.report.clarification.reasons[reason]);
  }
  for (const group of ['chips', 'narrative', 'empty', 'clarification']) {
    assert.deepEqual(Object.keys(en.chatWidget.report[group]).sort(), Object.keys(vi.chatWidget.report[group]).sort(), group);
  }
});

test('the report card wires chips, narrative, empty state and clarification without touching PDF export code', () => {
  const card = read('./report-chat-card.tsx');
  assert.match(card, /<ReportAppliedFilterChips chips=\{appliedChips\}/);
  assert.match(card, /\{narrativeView && <ReportNarrativePanel view=\{narrativeView\} \/>\}/);
  assert.match(card, /<ReportEmptyStatePanel/);
  assert.match(card, /<ReportClarificationPanel/);
  assert.match(card, /onChoose=\{\(filter\) => onApply\(attachment\.question, filter\)\}/);
  assert.match(card, /function ReportPdfExportProgress/);
});

test('the PDF export button sits next to Excel for analysis cards and requests the UI language', () => {
  const card = read('./report-chat-card.tsx');
  const exportBlock = card.slice(card.indexOf('{!isLearnerPlus && ('), card.indexOf('<AnimatePresence initial={false}>', card.indexOf('{!isLearnerPlus && (')));
  assert.match(exportBlock, /handleExportExcel/);
  assert.match(exportBlock, /!pdfExportJob && attachment\.kind === 'analysis' && \(\s*<ReportPdfExportProgress/);
  assert.match(exportBlock, /onStart=\{\(\) => onStartPdfExport\(messageId\)\}/);
  assert.match(exportBlock, /job=\{pdfExportJob\}/);
  const api = read('../../api/custom-chat.ts');
  assert.match(api, /'X-UI-Locale': useLocaleStore\.getState\(\)\.locale/);
  assert.match(api, /assistant_message_id: assistantMessageId, locale: useLocaleStore\.getState\(\)\.locale/);
  for (const dictionary of [vi, en]) {
    for (const key of ['exportPdf', 'downloadPdf', 'exportBusy', 'exportFailed']) {
      assert.equal(typeof dictionary.chatWidget.report[key], 'string', key);
    }
  }
});

test('a PDF job that finishes after the step presentation shows ready at once, not step 1', () => {
  const card = read('./report-chat-card.tsx');
  const effect = card.slice(card.indexOf('const startedAt = job?.presentationStartedAt;'), card.indexOf('const visibleStepIndex'));
  // The mount-time clock is caught up before any timer logic, otherwise a slow export stays on step 1.
  assert.match(effect, /getReadyPdfExportPresentationPhase\(startedAt, presentationNow\) !== getReadyPdfExportPresentationPhase\(startedAt, now\)\) \{\s*setPresentationNow\(now\);\s*return;/);
  const helper = card.slice(card.indexOf('export function getReadyPdfExportPresentationPhase'), card.indexOf('function getDisplayedPdfExportPhase'));
  const steps = card.match(/const PDF_EXPORT_PRESENTATION_STEP_MS = \[([^\]]+)\]/)[1].split(',').map((value) => Number(value.replace(/_/g, '').trim()));
  const source = ts.transpileModule(`const PDF_EXPORT_PRESENTATION_STEP_MS = ${JSON.stringify(steps)}; const PDF_EXPORT_PRESENTATION_TOTAL_MS = ${steps.reduce((a, b) => a + b, 0)};\n${helper.replace('export ', '')}\nresult = getReadyPdfExportPresentationPhase;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { result: null };
  runInNewContext(source, context);
  const phase = context.result;
  assert.equal(phase(0, 100), 'validating');
  assert.equal(phase(0, steps[0] + 1), 'narrative');
  assert.equal(phase(0, steps[0] + steps[1] + 1), 'rendering');
  assert.equal(phase(0, 10_000), 'ready');
});

function reportCard(dictionary, locale) {
  const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
  const motionTag = (tag) => (props) => React.createElement(tag, omitProps(props, ['initial', 'animate', 'exit', 'transition']));
  const modules = {
    'react-i18next': { useTranslation: () => ({ t: translator(dictionary) }) },
    '@tanstack/react-query': { useQuery: () => ({ data: undefined, isLoading: false }) },
    'framer-motion': { AnimatePresence: passthrough, motion: new Proxy({}, { get: (_target, tag) => motionTag(tag) }), useReducedMotion: () => true },
    '@/components/ui/button': { Button },
    '@/components/ui/select': { Select: passthrough, SelectContent: passthrough, SelectItem: passthrough, SelectTrigger: passthrough, SelectValue: passthrough },
    '@/components/ui/popover': { Popover: passthrough, PopoverContent: passthrough, PopoverTrigger: passthrough },
    '@/components/ui/calendar': { Calendar: () => null },
    '@/api/custom-reports': {},
    '@/utils/store': { useAuthStore: (selector) => selector({ user: { role: 'admin' }, groupLabels: null }) },
    '@/utils/group-labels': { getGroupLabelSet: () => unitLabels },
    '@/utils/export-report': { exportReportExcel: async () => undefined },
    '@/utils/locale-store': { useLocaleStore: (selector) => selector({ locale }) },
    './report-detail-modal': { ReportDetailModal: () => null },
    '@/components/reports/report-metric-trend-modal': { ReportMetricTrendModal: () => null },
    './report-chat-card.logic': logic,
    './report-chat-applied-filters': components(dictionary),
    './report-chat-clarification': components(dictionary),
    './report-chat-empty-state': components(dictionary),
    './report-chat-narrative': components(dictionary),
  };
  return loadCommonJs('./report-chat-card.tsx', modules).ReportChatCard;
}

function metricFact(id, unit, current, previous) {
  const delta = Math.round((current - previous) * 100) / 100;
  return {
    id, unit, current, previous,
    delta_absolute: delta,
    delta_percent: unit === 'count' && previous > 0 ? Math.round((delta / previous) * 10_000) / 100 : null,
    delta_percentage_points: unit === 'percentage' ? delta : null,
  };
}

function renderKpiCard(dictionary, locale, previousEnrollments) {
  const ReportChatCard = reportCard(dictionary, locale);
  const snapshot = {
    version: 2,
    generated_at: '2026-08-01T03:00:00.000Z',
    timezone: 'Asia/Ho_Chi_Minh',
    filter: { date_from: '2026-07-01', date_to: '2026-07-31' },
    comparison: { date_from: '2026-06-01', date_to: '2026-06-30', basis: 'calendar_month' },
    factual_metrics: [
      metricFact('total_learners', 'count', 120, 100),
      metricFact('active_learners', 'count', 35, 4),
      metricFact('completion_rate', 'percentage', 67.1, 58.2),
      metricFact('total_enrollments', 'count', 421, previousEnrollments),
    ],
    signals: [],
    signal_threshold_version: 'v1',
    summary: { overview: { total_learners: 120, active_learners: 35, completion_rate: 67.1, total_enrollments: 421 } },
    availability: { state: 'available', limitations: [] },
  };
  const attachment = logic.getReportChatAttachment({
    kind: 'report_analysis',
    report_question: 'Báo cáo tháng 7',
    report_filter: snapshot.filter,
    report_snapshot: snapshot,
  });
  return renderToStaticMarkup(React.createElement(ReportChatCard, {
    attachment, messageId: 'm1', onApply: noop, onStartPdfExport: noop, onDownloadPdfExport: noop, children: null,
  }));
}

test('KPI tiles never show a percentage from a tiny comparison period and add the plain note', () => {
  const viHtml = renderKpiCard(vi, 'vi', 47);
  assertTranslated(viHtml);
  assert.match(viHtml, /tăng 374 so với tháng trước/);
  assert.match(viHtml, /tăng 31 so với tháng trước/, 'active learners 4 -> 35 keep their absolute change');
  assert.equal((viHtml.match(/Kỳ trước quá ít dữ liệu để so sánh theo %/g) || []).length, 2, 'enrollments (+795,7 %) and active learners (base 4)');
  assert.match(viHtml, /tăng 20 so với tháng trước/, 'total learners 100 -> 120 has no note');
  assert.match(viHtml, /Tỷ lệ hoàn thành trung bình/, 'the completion rate keeps its name');
  assert.match(viHtml, /tăng 8,9 điểm % so với tháng trước/, '47 and 421 enrollments are enough to compare the rate');
  assert.doesNotMatch(viHtml, /795|775/);
  const enHtml = renderKpiCard(en, 'en', 47);
  assertTranslated(enHtml);
  assert.match(enHtml, /up 374 vs previous month/);
  assert.equal((enHtml.match(/Previous period too small for a % change/g) || []).length, 2);
  assert.doesNotMatch(enHtml, /795|775|Kỳ trước/);
});

test('the completion rate shows no change when a period has fewer than 10 enrollments', () => {
  const viHtml = renderKpiCard(vi, 'vi', 9);
  assertTranslated(viHtml);
  assert.match(viHtml, /Quá ít lượt ghi danh để so sánh với kỳ trước/);
  assert.doesNotMatch(viHtml, /điểm %/, 'no rate change on the tile or in the key findings');
  assert.doesNotMatch(viHtml, /Tỷ lệ hoàn thành tăng/);
  assert.match(viHtml, /Lượt ghi danh tăng 412 so với tháng trước\./, 'count findings stay');
  const enHtml = renderKpiCard(en, 'en', 9);
  assert.match(enHtml, /Too few enrollments for a comparison/);
  assert.doesNotMatch(enHtml, /percentage points/);
});
