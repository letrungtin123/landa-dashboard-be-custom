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

function components(dictionary) {
  const modules = {
    'react-i18next': { useTranslation: () => ({ t: translator(dictionary) }) },
    '@/components/ui/button': { Button: ({ variant, size, children, ...props }) => React.createElement('button', props, children) },
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
