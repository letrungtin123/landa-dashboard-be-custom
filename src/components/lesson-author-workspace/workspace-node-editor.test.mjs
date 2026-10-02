import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

// Component-handler harness plus real React SSR/parser. No HTTP, browser or
// DB writes; hook slots allow exercising Reset confirmation across rerenders.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
let hooks;
const editorReact = { ...React, useMemo: f => f(), useState(initial) {
  const h = hooks, i = h.cursor++;
  if (!(i in h.values)) h.values[i] = typeof initial === 'function' ? initial() : initial;
  return [h.values[i], value => { h.values[i] = typeof value === 'function' ? value(h.values[i]) : value; }];
}, useRef(initial) {
  const h = hooks, i = h.cursor++;
  if (!(i in h.values)) h.values[i] = { current: initial };
  return h.values[i];
}, useEffect(effect) { effect(); } };
const ui = Object.fromEntries(['Button', 'Input', 'Textarea'].map(name => [name,
  ({ children, ...props }) => {
    const { variant: _variant, ...rest } = props;
    return React.createElement(name === 'Button' ? 'button' : name === 'Input' ? 'input' : 'textarea', rest, children);
  },
]));
const RichTextEditor = ({ content, onChange }) => React.createElement('textarea', {
  'aria-label': 'Rich text content', value: content, onChange,
});
let lastDiagramEditorProps;
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const module = { exports: {} };
  const output = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = specifier => {
    if (specifier === 'react' && (filename.endsWith('workspace-node-editor.tsx') || filename.endsWith('workspace-component-draft-editor.tsx'))) return editorReact;
    if (specifier.startsWith('../ui/')) return ui;
    if (specifier === 'react-markdown') return { __esModule: true, default: ReactMarkdown };
    if (specifier === 'rehype-raw') return { __esModule: true, default: rehypeRaw };
    if (specifier.endsWith('/RichTextEditor')) return { __esModule: true, default: RichTextEditor };
    if (specifier.endsWith('/CrosswordPreview')) return { CrosswordPreviewInteractive: () => null };
    if (specifier.endsWith('/DiagramEditor')) return { __esModule: true, default: props => {
      lastDiagramEditorProps = props;
      return React.createElement('section', { 'data-diagram-editor': true }, props.displayName);
    } };
    if (specifier.endsWith('DiagramPreviewInteractive')) return { __esModule: true, default: () => null };
    if (specifier.startsWith('.')) return load(path.resolve(path.dirname(filename), `${specifier}.tsx`));
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(filename, module.exports); return module.exports;
}
const { WorkspaceNodeEditor, updateWorkspaceEditorField: update, validateWorkspaceEditorDraft: validate,
} = load(path.join(directory, 'workspace-node-editor.tsx'));
const content = data => ({ title: 'Original title', purpose: 'Original purpose', data, implementation_notes: null });
function detail(type, data, kind = 'component') {
  return { workspace_id: 'private-workspace', correlation_id: 'private-run', contract_version: 1, content_locale: 'vi',
    status: 'drafting', last_event_sequence: 3, updated_at: '2026-09-29T00:00:00Z', node_id: 'private-node', parent_id: 'private-parent',
    kind, component_type: type, media_type: kind === 'media_brief' ? 'video' : null,
    current_revision: 2, content_state: 'content_ready', content: content(data), user_modified: false, validation_contract: 'private-contract' };
}
const faq = detail('la_faq', { items: [{ id: 'private-a', question: 'Question one', answer: 'Answer one' }, { id: 'private-b', question: 'Question two', answer: 'Answer two' }] });
const sortable = detail('la_sortable', { question_text: 'Put in order', items: ['First', 'Second', 'Third'].map((text, id) => ({ id, text })) });
const crossword = detail('la_crossword', { words: ['CAT', 'DOG', 'BEE'].map((answer, row) => ({ id: `word-${row}`, answer, clue: `Clue ${row}`, hint: '', row, col: 0, direction: 'across' })), keyword_coordinates: [{ row: 0, col: 1 }] });
const diagram = detail('la_diagram', { start_diagram_id: 'd-private', diagrams: [{ id: 'd-private', name: 'Diagram name',
  nodes: ['Start', 'End'].map((label, i) => ({ id: `n${i}`, type: 'customShape', position: { x: i * 300, y: 0 }, data: { label, shape: 'rounded', bgColor: '#ffffff', textColor: '#000000', tooltip: 'Fixed tooltip' } })),
  edges: [{ id: 'e-private', source: 'n0', target: 'n1', label: 'Flow', data: { routing: 'orthogonal' } }],
}] });
const course = detail(null, { summary: 'Summary', target_audience: 'Audience', prerequisites: [], assessment_strategy: '' }, 'course');
const chapter = detail(null, { objective: 'Objective', learning_objectives: ['Outcome one', 'Outcome two'] }, 'chapter');
const lesson = detail(null, { objective: 'Objective', learning_objectives: ['Outcome'], learning_activities: ['Discuss'], assessment: 'Assessment' }, 'lesson');
const unit = detail(null, {}, 'unit');
const media = detail(null, { content_points: ['Brief point'], context_description: 'Scene' }, 'media_brief');
const htmlDetail = detail('html', '<section id="protected-id"><h2>Tiêu đề</h2><p>Hello &amp; <b>world</b>.</p><img src="https://private.test/image"><script>secretCode()</script></section>');
function problem(kind) {
  return detail('problem', { kind, question: 'Question', explanation: 'Explanation', hints: [],
    ...(['short_text', 'numerical'].includes(kind) ? { answers: ['42', '43'], ...(kind === 'short_text' ? { case_sensitive: true } : { tolerance: '0.5%' }) }
      : { choices: [{ text: 'One', correct: true }, { text: 'Two', correct: false }] }) });
}
function all(tree) {
  if (!React.isValidElement(tree)) return [];
  const rendered = typeof tree.type === 'function' ? tree.type(tree.props) : null;
  return [tree, ...(rendered ? all(rendered) : React.Children.toArray(tree.props.children).flatMap(all))];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return React.isValidElement(tree) ? React.Children.toArray(tree.props.children).map(text).join('') : '';
}
function harness(d = faq, patch = {}) {
  const calls = [], hookState = { cursor: 0, values: [] };
  const props = { detail: structuredClone(d), draft: structuredClone(d.content), baseRevision: d.current_revision, access: 'allowed', locale: 'en',
    onChange(next) { calls.push(['change', next]); props.draft = next; },
    onSave(next, revision) { calls.push(['save', next, revision]); }, onReset(revision) { calls.push(['reset', revision]); }, ...patch };
  function render() {
    hooks = hookState; hooks.cursor = 0;
    const root = WorkspaceNodeEditor(props);
    return typeof root.type === 'function' ? root.type(root.props) : root;
  }
  function button(label, occurrence = 0) { return all(render()).filter(e => (e.type === ui.Button || e.type === 'button') && text(e) === label)[occurrence]; }
  function field(label, occurrence = 0) {
    const row = all(render()).filter(e => e.type === 'label' && text(e) === label)[occurrence];
    const direct = all(render()).filter(e => (e.type === ui.Input || e.type === ui.Textarea || e.type === 'input' || e.type === 'textarea') && e.props['aria-label'] === label)[occurrence];
    assert.ok(row || direct, `field exists: ${label}`);
    return direct ?? all(row).find(e => e.type === ui.Input || e.type === ui.Textarea || e.type === 'input' || e.type === 'textarea');
  }
  return { props, calls, render, button, field, html: () => renderToStaticMarkup(render()),
    change(label, value, occurrence = 0) { field(label, occurrence).props.onChange({ target: { value, checked: value } }); },
    click(label, occurrence = 0) { const b = button(label, occurrence); assert.ok(b, label); b.props.onClick?.(); },
    richText(value) { const editor = all(render()).find(e => e.type === RichTextEditor); assert.ok(editor); editor.props.onChange(value); },
    richTextAt(occurrence, value) { const editor = all(render()).filter(e => e.type === RichTextEditor)[occurrence]; assert.ok(editor); editor.props.onChange(value); },
    submit() { render().props.onSubmit({ preventDefault() {} }); } };
}

for (const locale of ['en', 'vi']) test(`${locale}: localized controlled form keeps original content and hides protected IDs`, () => {
  const f = harness(faq, { locale });
  const html = f.html();
  assert.match(html, /Question one/); assert.match(html, /lang="vi"/);
  assert.ok(!html.includes(locale === 'en' ? 'Save changes' : 'Lưu chỉnh sửa'));
  assert.ok(!html.includes(locale === 'en' ? 'Reset to AI baseline' : 'Đặt lại bản AI gốc'));
  assert.doesNotMatch(html, /private-a|private-node|private-parent|private-contract|private-workspace|Rise Block|Block ID|type="file"/);
  assert.equal(f.calls.length, 0);
});

for (const access of ['unknown', 'blocked']) test(`${access}: editor hides all cached private content and write actions`, () => {
  const f = harness(faq, { access });
  assert.doesNotMatch(f.html(), /Original title|Question one|Save changes|Reset to AI baseline/);
  assert.equal(f.calls.length, 0);
});

test('pending nodes and unknown component/media types do not expose editable forms', () => {
  for (const state of ['planned', 'generating', 'needs_action']) {
    const d = { ...faq, content_state: state };
    assert.doesNotMatch(harness(d).html(), /<textarea|Save changes/);
    assert.equal(update(d, d.content, 0, 'Changed'), null);
  }
  for (const d of [{ ...faq, component_type: null }, { ...faq, component_type: undefined }, { ...media, media_type: null }]) {
    assert.equal(validate(d, d.content), 'unsupported');
    assert.doesNotMatch(harness(d).html(), /<textarea|Save changes/);
  }
});

test('controlled draft edits preserve content envelope, emit no detail/provenance, and Save carries original revision', () => {
  const f = harness(); const before = structuredClone(f.props.detail);
  f.change('Display name', 'Tên mới');
  f.change('Question 1', 'Câu hỏi mới');
  assert.deepEqual(f.props.detail, before);
  assert.deepEqual(Object.keys(f.props.draft).sort(), ['data', 'implementation_notes', 'purpose', 'title']);
  assert.equal(f.props.draft.purpose, 'Original purpose');
  assert.equal(f.props.draft.implementation_notes, null);
  assert.doesNotMatch(f.html(), /Purpose|Implementation notes/);
  assert.equal(f.props.draft.data.items[0].id, 'private-a');
  assert.equal(f.props.draft.data.items[1].question, 'Question two');
  f.submit();
  assert.deepEqual(f.calls.at(-1), ['save', f.props.draft, 2]);
  assert.notEqual(f.calls.at(-1)[1], f.props.draft, 'host gets its own copy');
  assert.doesNotMatch(f.html(), /Saved successfully/);
});

for (const patch of [{ busy: true }, { conflict: true }, { baseRevision: 1 }, { baseRevision: null }]) test(`writes and changes are guarded with ${JSON.stringify(patch)}`, () => {
  const dirty = structuredClone(faq.content); dirty.title = 'Dirty title';
  const save = harness(faq, { ...patch, draft: dirty });
  assert.equal(save.button('Save changes').props.disabled, true);
  assert.equal(save.button('Reset to AI baseline'), undefined);
  save.change('Display name', 'Must not change'); save.submit();
  assert.equal(save.calls.length, 0); assert.equal(save.props.draft.title, 'Dirty title');
  const reset = harness({ ...faq, user_modified: true }, patch);
  assert.equal(reset.button('Save changes'), undefined);
  assert.equal(reset.button('Reset to AI baseline').props.disabled, true);
  reset.click('Reset to AI baseline'); assert.equal(reset.calls.length, 0);
});

test('Reset requires confirmation, carries expected revision and never locally claims a reset', () => {
  const f = harness({ ...faq, user_modified: true });
  f.click('Reset to AI baseline'); assert.equal(f.calls.length, 0);
  f.click('Cancel'); assert.equal(f.button('Confirm reset'), undefined);
  f.click('Reset to AI baseline'); f.props.busy = true; f.click('Confirm reset'); assert.equal(f.calls.length, 0);
  f.props.busy = false; f.click('Confirm reset');
  assert.deepEqual(f.calls, [['reset', 2]]); assert.deepEqual(f.props.draft, faq.content);
});

test('temporarily invalid text remains editable, while invalid or unchanged drafts cannot Save', () => {
  const f = harness();
  assert.equal(f.button('Save changes'), undefined); f.submit(); assert.equal(f.calls.length, 0);
  f.change('Question 1', '');
  assert.equal(f.field('Question 1').props.value, '');
  assert.equal(f.button('Save changes').props.disabled, true); f.submit();
  assert.equal(f.calls.filter(c => c[0] === 'save').length, 0);
  f.change('Question 1', 'Repaired'); assert.equal(f.button('Save changes').props.disabled, false);
  f.change('Question 1', '<script>bad()</script>'); assert.equal(f.button('Save changes').props.disabled, true);
});

for (const kind of ['multiple_choice', 'multiple_select', 'dropdown', 'short_text', 'numerical']) test(`${kind}: typed problem fields retain subtype/count/case rules`, () => {
  const d = problem(kind), f = harness(d);
  f.change('Question', 'New question'); f.change('Explanation', 'New feedback');
  if ('choices' in d.content.data) {
    f.change('Choice 2', 'New second choice');
    if (kind === 'multiple_select') { f.change('Correct answer 1', false); f.change('Correct answer 2', true); }
    else f.change('Correct answer 2', true);
    assert.deepEqual(f.props.draft.data.choices.map(c => c.correct), [false, true]);
    assert.equal(f.props.draft.data.choices.length, 2);
  } else {
    f.change('Accepted answer 1', '44');
    assert.equal(f.props.draft.data.answers.length, 2);
    if (kind === 'short_text') assert.equal(f.props.draft.data.case_sensitive, true);
    else f.change('Tolerance', '1%');
  }
  assert.equal(f.props.draft.data.kind, kind);
  assert.equal(validate(d, f.props.draft), null);
  const forged = structuredClone(f.props.draft); forged.data.kind = 'other'; assert.equal(validate(d, forged), 'invalid');
});

test('answer validity disables Save for wrong cardinality, duplicate labels, malformed numeric answers/tolerance', () => {
  const single = harness(problem('multiple_choice'));
  single.change('Correct answer 2', true); single.change('Choice 2', 'One'); assert.equal(single.button('Save changes').props.disabled, true);
  const multi = harness(problem('multiple_select')); multi.change('Correct answer 1', false); assert.equal(multi.button('Save changes').props.disabled, true);
  const numeric = harness(problem('numerical')); numeric.change('Accepted answer 1', 'not numeric'); assert.equal(numeric.button('Save changes').props.disabled, true);
  numeric.change('Accepted answer 1', '40'); numeric.change('Tolerance', '-1'); assert.equal(numeric.button('Save changes').props.disabled, true);
});

test('Problem hint fields use the same editable list contract and persist in the complete draft', () => {
  const f = harness(problem('multiple_choice'));
  f.click('Add hint');
  f.change('Hint 1', 'Review the first step.');
  assert.deepEqual(f.props.draft.data.hints, ['Review the first step.']);
  assert.equal(validate(f.props.detail, f.props.draft), null);
  assert.equal(f.button('Save changes').props.disabled, false);
});

test('production Quiz payload stays saveable after the plain-text choice edit shown in the UI recording', () => {
  const d = detail('problem', {
    kind: 'multiple_choice', hints: [],
    question: 'Trong chương trình huấn luyện lãnh đạo cấp cao, ba trụ cột cốt lõi cùng thông tin đối tượng và phiên bản quy định là gì?',
    explanation: 'Tài liệu xác lập ba trụ cột cốt lõi và quy định rõ đối tượng sử dụng.',
    choices: [
      { text: 'TRỤ CỘT 01: Business Excellence; TRỤ CỘT 02: ERA5.0 Connection; TRỤ CỘT 03: Made-in-World Scale.', correct: true },
      { text: 'TRỤ CỘT 01: Local Mindset; TRỤ CỘT 02: Digital Marketing; TRỤ CỘT 03: Fast Growth.', correct: false },
      { text: 'TRỤ CỘT 01: Low Cost; TRỤ CỘT 02: Automation 4.0; TRỤ CỘT 03: Export Only.', correct: false },
      { text: 'TRỤ CỘT 01: Agile Process; TRỤ CỘT 02: AI Integration; TRỤ CỘT 03: Global Branding.', correct: false },
    ],
  });
  const f = harness(d);
  f.change('Choice 4', 'TRỤ CỘT 01: Agile Process; TRỤ CỘT 02: AI Integration; TRỤ CỘT 03: Global Branding. 123');
  assert.equal(validate(d, f.props.draft), null);
  assert.equal(f.button('Save changes').props.disabled, false);
});

test('FAQ/sortable/crossword preserve canonical IDs and coordinates across text edits while allowing outline-valid list edits', () => {
  const q = harness(faq); q.click('Add item'); q.change('Question 3', 'Question three'); q.change('Accepted answer 3', 'Answer three');
  assert.equal(q.props.draft.data.items.length, 3); assert.equal(validate(faq, q.props.draft), null);
  const s = harness(sortable); s.change('Choice 2', 'Revised second'); assert.equal(validate(sortable, s.props.draft), null);
  assert.deepEqual(s.props.draft.data.items.map(i => i.id), [0, 1, 2]);
  const w = harness(crossword); w.change('Accepted answer 1', 'CATS'); w.change('Clue 1', 'New clue'); w.change('Hint 1', 'New hint');
  assert.equal(validate(crossword, w.props.draft), null);
  assert.deepEqual(w.props.draft.data.keyword_coordinates, crossword.content.data.keyword_coordinates);
  assert.deepEqual(w.props.draft.data.words.map(({ id, row, col, direction }) => ({ id, row, col, direction })),
    crossword.content.data.words.map(({ id, row, col, direction }) => ({ id, row, col, direction })));
  w.change('Accepted answer 1', 'A'); assert.equal(validate(crossword, w.props.draft), 'invalid');
  assert.equal(w.field('Accepted answer 1').props.value, 'A');
  assert.equal(w.button('Save changes').props.disabled, true);
  for (const d of [faq, crossword]) {
    const forged = structuredClone(d.content), key = d === crossword ? 'words' : 'items';
    forged.data[key].reverse();
    if (d === crossword) forged.data.words.forEach((word, index) => { word.row = index; });
    assert.equal(validate(d, forged), null);
    assert.equal(update(d, forged, 0, 'New title'), null);
  }
});

test('sortable exposes familiar outline list controls and accepts validated reorder', () => {
  const f = harness(sortable);
  assert.match(f.html(), /Add item/);
  const forged = structuredClone(sortable.content); forged.data.items.reverse();
  assert.equal(validate(sortable, forged), null);
});

test('diagram uses the canonical Course Outline editor and ignores non-editable renderer fields', () => {
  const f = harness(diagram);
  assert.match(f.html(), /data-diagram-editor="true"/);
  assert.equal(lastDiagramEditorProps.diagramData.diagrams[0].nodes.length, 2);
  assert.equal(lastDiagramEditorProps.diagramData.diagrams[0].edges.length, 1);
  const moved = structuredClone(diagram.content);
  moved.data.diagrams[0].name = 'Revised diagram';
  moved.data.diagrams[0].nodes[0].position.x += 32;
  moved.data.diagrams[0].edges[0].target = 'n0';
  assert.equal(validate(diagram, moved), 'invalid');
  moved.data.diagrams[0].edges[0].target = 'n1';
  assert.equal(validate(diagram, moved), null);
  const unknown = structuredClone(moved); unknown.data.immutable = { refs: ['other'] };
  assert.equal(validate(diagram, unknown), null, 'read projection ignores fields that the form cannot edit');
  assert.equal(update(diagram, unknown, 0, 'Renamed'), null, 'field updates cannot emit a draft with forged fields');
});

test('bot diagram payload reaches the Course Outline editor with every node and edge intact', () => {
  const nodes = Array.from({ length: 10 }, (_, index) => ({
    id: `node_${index + 1}`, type: 'customShape', position: { x: (index % 5) * 260, y: Math.floor(index / 5) * 180 },
    data: { label: `Node ${index + 1}`, shape: index % 2 ? 'rounded' : 'rectangle', bgColor: '#eef2ff', textColor: '#3730a3', target_diagram_id: '' },
    style: { backgroundImage: 'url(https://must-not-reach-renderer.test)' },
  }));
  const edges = [
    ...Array.from({ length: 9 }, (_, index) => ({ id: `edge_${index + 1}`, source: `node_${index + 1}`, target: `node_${index + 2}` })),
    { id: 'edge_10', source: 'node_1', target: 'node_3' },
    { id: 'edge_11', source: 'node_4', target: 'node_7' },
    { id: 'edge_12', source: 'node_8', target: 'node_10' },
  ].map(edge => ({ ...edge, type: 'deletable', style: { stroke: '#64748b' }, data: { routing: 'orthogonal', feedbackSide: 'right' } }));
  const f = harness(detail('la_diagram', { start_diagram_id: 'root', diagrams: [{ id: 'root', name: 'AI diagram', nodes, edges }] }));
  assert.match(f.html(), /data-diagram-editor="true"/);
  assert.equal(lastDiagramEditorProps.diagramData.diagrams[0].nodes.length, 10);
  assert.equal(lastDiagramEditorProps.diagramData.diagrams[0].edges.length, 12);
  assert.equal(lastDiagramEditorProps.diagramData.diagrams[0].nodes[0].style, undefined);
  assert.equal(lastDiagramEditorProps.diagramData.diagrams[0].edges[0].style, undefined);
});

test('React Flow measurement stays local while authored diagram changes update the canonical draft', () => {
  const f = harness(diagram);
  f.html();
  const measured = structuredClone(lastDiagramEditorProps.diagramData);
  measured.diagrams[0].nodes[0].measured = { width: 220, height: 56 };
  lastDiagramEditorProps.onDiagramDataChange(measured, 'transient');
  assert.equal(f.calls.length, 0, 'renderer-only dimensions never dirty the AI workspace draft');
  f.html();
  assert.deepEqual(lastDiagramEditorProps.diagramData.diagrams[0].nodes[0].measured, { width: 220, height: 56 },
    'controlled React Flow receives its measured dimensions on the next render');

  const moved = structuredClone(lastDiagramEditorProps.diagramData);
  moved.diagrams[0].nodes[0].position.x = 144;
  lastDiagramEditorProps.onDiagramDataChange(moved, 'persist');
  assert.equal(f.calls.length, 1);
  assert.equal(f.props.draft.data.diagrams[0].nodes[0].position.x, 144);
  assert.equal(f.props.draft.data.diagrams[0].nodes[0].measured, undefined,
    'workspace persistence keeps only the canonical course component payload');
});

test('HTML uses one complete rich-text payload editor instead of fragmented text slots', () => {
  const f = harness(htmlDetail);
  assert.match(f.html(), /Lesson content|Rich text content/);
  assert.doesNotMatch(f.html(), /Text segment|Đoạn văn bản/);
  assert.equal(all(f.render()).filter(element => element.type === RichTextEditor).length, 1);
  const nextHtml = '<h2>Nội dung đã sửa</h2><p>Một payload hoàn chỉnh.</p>';
  f.richText(nextHtml);
  assert.equal(f.props.draft.data, nextHtml);
  assert.equal(validate(htmlDetail, f.props.draft), null);
  assert.equal(f.props.draft.purpose, htmlDetail.content.purpose);
  assert.equal(f.props.draft.implementation_notes, htmlDetail.content.implementation_notes);
});

test('workspace component editor has no course-write, upload, autosave or raw HTML side effects', () => {
  const source = readFileSync(path.join(directory, 'workspace-component-draft-editor.tsx'), 'utf8');
  assert.doesNotMatch(source, /custom-course-authoring|updateXBlock|studioSubmit|uploadCourseAsset|deleteCourseAsset|dangerouslySetInnerHTML|fetch\s*\(|axios/);
  assert.doesNotMatch(source, /draggable=|onDragStart|onDragOver/);
});

test('workspace forms retain the visual vocabulary of Course Outline editors', () => {
  const source = readFileSync(path.join(directory, 'workspace-component-draft-editor.tsx'), 'utf8');
  for (const token of ['app-liquid-card', 'focus-within:ring-4', 'lg:flex-row', 'hover:border-primary/30',
    'CrosswordPreviewInteractive', 'RichTextEditor', 'DiagramEditor']) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('diagram workspace fills the remaining modal area and refits only after layout settles', () => {
  const componentSource = readFileSync(path.join(directory, 'workspace-component-draft-editor.tsx'), 'utf8');
  const editorSource = readFileSync(path.join(directory, 'workspace-node-editor.tsx'), 'utf8');
  const hostSource = readFileSync(path.join(directory, 'workspace-course-host.tsx'), 'utf8');
  const diagramSource = readFileSync(path.join(directory, '..', 'course-editor', 'editors', 'DiagramEditor.tsx'), 'utf8');
  assert.match(componentSource, /h-full min-h-0 w-full overflow-hidden/);
  assert.match(componentSource, /preview\.type === 'la_diagram' \? 'h-full min-h-0'/);
  assert.doesNotMatch(componentSource, /100dvh-11rem|min-h-\[560px\]/);
  assert.match(editorSource, /diagram \? 'overflow-hidden p-0'/);
  assert.match(hostSource, /100dvh-2rem/);
  assert.match(diagramSource, /onInit=\{instance =>/);
  assert.match(diagramSource, /ResizeObserver/);
  assert.match(diagramSource, /MutationObserver/);
  assert.match(diagramSource, /react-flow__node/);
  assert.match(diagramSource, /instance\.fitView/);
  assert.match(diagramSource, /topologySignature/);
  assert.match(diagramSource, /DiagramChangeIntent/);
  assert.match(componentSource, /intent === 'transient'/);
});

test('chapter/section/lesson expose title-only edits and preserve all protected analysis fields', () => {
  for (const d of [chapter, lesson, unit]) {
    const f = harness(d); const protectedBefore = structuredClone({ purpose: d.content.purpose, data: d.content.data,
      implementation_notes: d.content.implementation_notes });
    assert.equal(validate(d, d.content), null);
    f.change('Title', `Revised ${d.kind}`);
    assert.equal(validate(d, f.props.draft), null);
    assert.deepEqual({ purpose: f.props.draft.purpose, data: f.props.draft.data,
      implementation_notes: f.props.draft.implementation_notes }, protectedBefore);
    assert.equal(f.button('Save changes').props.disabled, false);
    f.submit(); assert.equal(f.calls.at(-1)[0], 'save');
    const forged = structuredClone(f.props.draft); forged.data = { changed: true };
    assert.equal(validate(d, forged), 'structure');
  }
});

test('course analysis and media briefs remain read-only', () => {
  for (const d of [course, media]) {
    assert.equal(validate(d, d.content), 'unsupported');
    assert.doesNotMatch(harness(d).html(), /Save changes|Lưu chỉnh sửa|<textarea|<input/);
  }
});

test('hierarchy editor renders AI review cards instead of a duplicate title input', () => {
  const dirty = structuredClone(chapter.content); dirty.title = 'Revised chapter';
  const f = harness(chapter, { draft: dirty, titleInHeader: true,
    reviewContent: React.createElement('section', { 'data-ai-review-cards': true }, 'AI objective cards') });
  assert.match(f.html(), /data-ai-review-cards="true"/);
  assert.match(f.html(), /AI objective cards/);
  assert.doesNotMatch(f.html(), /<input/);
  assert.equal(f.button('Save changes').props.disabled, false);
});

test('applied view keeps the review cards mounted and hides Save, Reset and Apply', () => {
  const applied = harness({ ...chapter, user_modified: true }, { readOnly: true,
    titleInHeader: true, reviewContent: React.createElement('section', null, 'AI objective cards'),
    onApply() { throw new Error('must not apply'); }, applyLabel: 'Apply entire chapter' });
  assert.match(applied.html(), /AI objective cards/);
  assert.doesNotMatch(applied.html(), /<input/);
  assert.doesNotMatch(applied.html(), /Save changes|Reset to AI baseline|Apply entire chapter/);
  applied.submit();
  assert.equal(applied.calls.length, 0); assert.equal(applied.props.draft.title, 'Original title');
});

test('forged envelope fields and invalid component payloads cannot be emitted or saved', () => {
  const examples = [
    [faq, d => { d.provenance = 'forged'; }], [faq, d => { d.data.items.push({ id: 'new', question: '', answer: 'A' }); }],
    [problem('short_text'), d => { d.data.answers = []; }],
  ];
  for (const [original, mutate] of examples) {
    const draft = structuredClone(original.content); mutate(draft);
    assert.notEqual(validate(original, draft), null); assert.equal(update(original, draft, 0, 'Renamed'), null);
    const f = harness(original, { draft }); f.submit(); assert.equal(f.calls.length, 0);
  }
});
