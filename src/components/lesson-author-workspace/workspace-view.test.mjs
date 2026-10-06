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

// Real React SSR and HTML parser. UI portals/Flow geometry are replaced with
// inert boundaries: these tests do not claim browser focus/layout/E2E coverage.
const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));
const h = React.createElement;
let lastFlow;
let lastDiagram;
const element = tag => ({ children, className }) => h(tag, { className }, children);
const ui = {
  Dialog: ({ open, children }) => open ? h('div', { role: 'dialog' }, children) : null,
  DialogContent: element('section'), DialogClose: ({ children }) => children,
  DialogTitle: element('h2'), DialogDescription: element('p'),
  Badge: element('span'),
  Button: React.forwardRef(({ children, onClick }, ref) => h('button', { ref, onClick }, children)),
  Tabs: element('div'), TabsList: element('nav'), TabsTrigger: element('button'), TabsContent: element('div'),
};
const flow = {
  Position: { Left: 'left', Right: 'right' }, MarkerType: { ArrowClosed: 'arrowclosed' }, Handle: () => null, Background: () => null, Controls: () => null, MiniMap: () => null, Panel: element('div'),
  ReactFlowProvider: element('div'),
  useNodesState: initial => [initial, () => {}, () => {}],
  useEdgesState: initial => [initial, () => {}, () => {}],
  ReactFlow: props => {
    lastFlow = props;
    return h('div', null, props.nodes.map(n => h(props.nodeTypes[n.type], { key: n.id, data: n.data })));
  },
};
const modules = new Map();
function load(filename) {
  if (modules.has(filename)) return modules.get(filename);
  const module = { exports: {} };
  const source = readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  function localRequire(specifier) {
    if (specifier.endsWith('.css')) return {};
    if (specifier.startsWith('../ui/')) return ui;
    if (specifier === '@xyflow/react') return flow;
    if (specifier === 'framer-motion') return { motion: { div: ({ children, ...props }) => h('div', props, children) } };
    if (specifier === 'react-markdown') return { __esModule: true, default: ReactMarkdown };
    if (specifier === 'rehype-raw') return { __esModule: true, default: rehypeRaw };
    if (specifier.endsWith('DiagramPreviewInteractive')) return { __esModule: true, default: ({ data }) => {
      lastDiagram = data; return h('div', null, data.diagrams.map(d => h('p', { key: d.id }, d.name)));
    } };
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), specifier);
      return load(base + (specifier.endsWith('workspace-node-detail') || specifier.endsWith('workspace-ai-avatar') ? '.tsx' : '.ts'));
    }
    return require(specifier);
  }
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  modules.set(filename, module.exports);
  return module.exports;
}
const detailModule = load(path.join(directory, 'workspace-node-detail.tsx'));
const { WorkspaceDetailContent, WorkspaceNodeDetail, readWorkspacePreview, workspaceCopy, workspaceLearningOutcomeLabel,
  workspaceDetailStats } = detailModule;
const { WorkspaceDialog, WorkspaceGraphNode, WorkspacePendingSkeleton, projectWorkspaceGraph, collapseWorkspaceBranch, collapseWorkspaceToChapterLevel, initialWorkspaceExpansion, workspaceOverviewCounts,
  workspaceNodeTypeLabel, workspaceProgressiveRevealQueue } = load(path.join(directory, 'workspace-dialog.tsx'));
const base = { workspace_id: 'workspace-private', correlation_id: 'run-private', contract_version: 1, content_locale: 'en',
  status: 'ready', last_event_sequence: 4, updated_at: '2026-09-29T00:00:00Z' };
function node(id, kind, parent = null, order = 0) {
  return { node_id: id, parent_id: parent, kind, canonical_path: `private.${id}`, sort_order: order,
    content_state: 'content_ready', current_revision: 2, component_type: kind === 'component' ? 'html' : null,
    media_type: kind === 'media_brief' ? 'video' : null,
    title: `Private ${kind}`, user_modified: false, applied: false };
}
const root = node('root-private', 'course');
const chapter = { ...node('chapter-private', 'chapter', root.node_id), user_modified: true };
const lesson = node('lesson-private', 'lesson', chapter.node_id);
const unit = node('unit-private', 'unit', lesson.node_id);
const component = node('component-private', 'component', unit.node_id);
const media = node('media-private', 'media_brief', unit.node_id, 1);
const graph = { ...base, snapshot_sequence: 4, overview_ready: true, structure_ready: true, total_nodes: 6,
  nodes: [media, chapter, component, root, unit, lesson], has_more: false, next_after_node_id: null };
function detail(type, data, selected = component) {
  return { ...base, ...selected, component_type: type, media_type: null, content: {
    title: 'Real detail title', purpose: 'Real purpose', implementation_notes: 'Author notes', data,
  }, validation_contract: 'workspace-component-1' };
}
const courseDetail = detail(null, { summary: 'Actual summary', target_audience: 'Managers', prerequisites: ['Leadership experience'],
  assessment_strategy: 'Scenario assessment' }, root);
const chapterDetail = detail(null, { objective: 'Real chapter outcome', learning_objectives: ['lo_1: Specific outcome'] }, chapter);
const state = { opened: true, visible: true, busy: false, access: 'allowed', status: { ...base, node_count: 6, unit_count: 1, ready_unit_count: 1 },
  graph, stale: false, selectedNodeId: chapter.node_id, detail: chapterDetail, detailStale: false, drafts: {}, error: null };
const renderDetail = (d, locale = 'en', stats) => renderToStaticMarkup(h(WorkspaceDetailContent, { detail: d, locale, stats }));
const renderDialog = (patch = {}, locale = 'en', other = {}) => renderToStaticMarkup(h(WorkspaceDialog, {
  open: true, locale, state: { ...state, ...patch }, onSelectNode() {}, onOpenChange() {}, ...other,
}));

test('projects only complete committed graphs, opens committed branches for realtime reveal and supports collapsed pruning', () => {
  assert.deepEqual(projectWorkspaceGraph(null), []);
  assert.deepEqual(projectWorkspaceGraph({ ...graph, has_more: true }), []);
  assert.deepEqual(projectWorkspaceGraph({ ...graph, total_nodes: 7 }), []);
  assert.deepEqual(projectWorkspaceGraph({ ...graph, structure_ready: false }).map(n => n.node.node_id),
    [root.node_id, chapter.node_id, lesson.node_id, unit.node_id, media.node_id, component.node_id],
    'a complete committed partial-success snapshot remains interactive');
  assert.deepEqual(projectWorkspaceGraph(graph).map(n => n.node.node_id), [root.node_id, chapter.node_id, lesson.node_id, unit.node_id, media.node_id, component.node_id]);
  const all = Object.fromEntries(graph.nodes.map(n => [n.node_id, true]));
  const projected = projectWorkspaceGraph(graph, all);
  assert.deepEqual(projected.map(n => n.node.node_id), [root.node_id, chapter.node_id, lesson.node_id, unit.node_id, media.node_id, component.node_id]);
  const componentY = projected.find(n => n.node.node_id === component.node_id).position.y;
  const mediaY = projected.find(n => n.node.node_id === media.node_id).position.y;
  assert.ok(Math.abs(componentY - mediaY) >= 180, 'visible sibling cards reserve non-overlapping vertical space');
  assert.equal(projectWorkspaceGraph(graph, { ...all, [chapter.node_id]: false }).length, 2);
  assert.deepEqual(projectWorkspaceGraph(graph, collapseWorkspaceToChapterLevel(graph)).map(n => n.node.node_id),
    [root.node_id, chapter.node_id], 'collapse all keeps the course and every chapter visible');
  const rename = { ...graph, nodes: graph.nodes.map(n => ({ ...n, title: 'Renamed', current_revision: 3 })) };
  assert.deepEqual(projectWorkspaceGraph(rename, all).map(n => [n.node.node_id, n.position]), projected.map(n => [n.node.node_id, n.position]));
  const big = { ...graph, total_nodes: 1001, nodes: [root, ...Array.from({ length: 1000 }, (_, i) => node(`c${i}`, 'chapter', root.node_id, i))] };
  assert.equal(projectWorkspaceGraph(big).length, 1001);
  assert.equal(projectWorkspaceGraph(big, { [root.node_id]: false }).length, 1);
});

test('live draft header uses the exact authorized conversation title', () => {
  const html = renderDialog({}, 'vi', { draftTitle: 'Thiết kế BiC dành cho lãnh đạo' });
  assert.match(html, /Thiết kế BiC dành cho lãnh đạo/);
  assert.doesNotMatch(html, />Bản thiết kế khoá học</);
});

test('overview counts committed hierarchy and interactive components without counting media briefs', () => {
  assert.deepEqual(workspaceOverviewCounts(graph), { chapters: 1, sections: 1, lessons: 1, interactive: 1 });
  assert.deepEqual(workspaceOverviewCounts(null), { chapters: 0, sections: 0, lessons: 0, interactive: 0 });
  assert.equal(workspaceCopy.vi.chapters, 'Cấu trúc khoá học');
  assert.equal(workspaceCopy.en.chapters, 'Course structure');
});

test('component node pills use the protected component discriminator in both locales and fail closed', () => {
  assert.equal(workspaceCopy.vi.prerequisites, 'Kiến thức cần đạt được');
  assert.equal(workspaceCopy.en.prerequisites, 'Required knowledge');
  const labels = {
    html: ['Theory', 'Lý thuyết'], problem: ['Quiz', 'Quiz'], la_faq: ['FAQ', 'Hỏi đáp'],
    la_sortable: ['Sortable', 'Sắp xếp'], la_crossword: ['Crossword', 'Ô chữ'], la_diagram: ['Visual diagram', 'Sơ đồ trực quan'],
  };
  for (const [component_type, [en, vi]] of Object.entries(labels)) {
    const value = { kind: 'component', component_type };
    assert.equal(workspaceNodeTypeLabel(value, 'en'), en);
    assert.equal(workspaceNodeTypeLabel(value, 'vi'), vi);
  }
  assert.equal(workspaceNodeTypeLabel({ kind: 'component', component_type: null }, 'vi'), workspaceCopy.vi.component);
  assert.equal(workspaceNodeTypeLabel({ kind: 'chapter' }, 'vi'), workspaceCopy.vi.chapter);
  assert.equal(workspaceNodeTypeLabel({ kind: 'media_brief', component_type: null, media_type: 'video' }, 'vi'), 'Video');
  assert.equal(workspaceNodeTypeLabel({ kind: 'media_brief', component_type: null, media_type: 'static_infographic' }, 'vi'), 'Infographic');
  assert.equal(workspaceNodeTypeLabel({ kind: 'media_brief', component_type: null, media_type: null }, 'vi'), workspaceCopy.vi.media_brief);
});

test('quality metadata remains internal and is not rendered as a technical node pill', () => {
  const markup = renderToStaticMarkup(h(WorkspaceGraphNode, {
    data: { node: { ...node('quality-component', 'component'), quality_state: 'review_required' }, locale: 'vi', childCount: 0,
      expanded: false, onExpand: () => undefined }, selected: false,
  }));
  assert.doesNotMatch(markup, /Nội dung theo tài liệu nguồn|review recommended/);
});

test('reopened terminal workspaces start collapsed at chapter level while active streams stay expanded', () => {
  const active = { ...state.status, status: 'drafting' };
  const terminal = { ...state.status, status: 'ready' };
  assert.deepEqual(initialWorkspaceExpansion(graph, active), {});
  const collapsed = initialWorkspaceExpansion(graph, terminal);
  assert.deepEqual(projectWorkspaceGraph(graph, collapsed).map(item => item.node.node_id), [root.node_id, chapter.node_id]);
  assert.deepEqual(initialWorkspaceExpansion({ ...graph, structure_ready: false }, terminal), collapseWorkspaceToChapterLevel(graph));
  assert.deepEqual(initialWorkspaceExpansion({ ...graph, structure_ready: false }, active), {});
  assert.equal(initialWorkspaceExpansion(graph, null), null);
});

test('terminal partial-success graph renders committed interactive nodes instead of an endless skeleton', () => {
  const partialGraph = { ...graph, status: 'needs_action', structure_ready: false };
  const html = renderDialog({ graph: partialGraph, status: { ...state.status, status: 'needs_action',
    node_count: partialGraph.total_nodes, unit_count: 2, ready_unit_count: 1 } }, 'vi');
  assert.match(html, /Private course/);
  assert.match(html, /Private chapter/);
  assert.doesNotMatch(html, /data-pending-mindmap-canvas="true"/);
  assert.doesNotMatch(html, new RegExp(workspaceCopy.vi.terminalNeedsAction));
  assert.doesNotMatch(html, new RegExp(workspaceCopy.vi.terminalReload));
  assert.doesNotMatch(html, /Bước gặp lỗi/);
});

test('collapsing a branch clears every hidden descendant so reopening reveals one level without a layout burst', () => {
  const expanded = Object.fromEntries(graph.nodes.map(item => [item.node_id, true]));
  const collapsed = collapseWorkspaceBranch(graph, expanded, chapter.node_id);
  for (const id of [chapter.node_id, lesson.node_id, unit.node_id, component.node_id, media.node_id]) assert.equal(collapsed[id], false);
  assert.equal(collapsed[root.node_id], true);
  const reopened = { ...collapsed, [chapter.node_id]: true };
  assert.deepEqual(projectWorkspaceGraph(graph, reopened).map(item => item.node.node_id),
    [root.node_id, chapter.node_id, lesson.node_id]);
});

test('successive committed snapshots reveal each ready unit subtree without waiting for the whole course', () => {
  const structure = { ...graph, status: 'drafting', total_nodes: 3, nodes: [chapter, root, lesson] };
  assert.deepEqual(projectWorkspaceGraph(structure).map(n => n.node.node_id), [root.node_id, chapter.node_id, lesson.node_id]);
  const firstUnit = { ...structure, snapshot_sequence: 5, last_event_sequence: 5, total_nodes: 5,
    nodes: [component, chapter, root, unit, lesson] };
  assert.deepEqual(projectWorkspaceGraph(firstUnit).map(n => n.node.node_id),
    [root.node_id, chapter.node_id, lesson.node_id, unit.node_id, component.node_id]);
  const revealed = new Set([root.node_id, chapter.node_id, lesson.node_id]);
  assert.deepEqual(workspaceProgressiveRevealQueue(firstUnit, revealed), [unit.node_id, component.node_id]);
  assert.deepEqual(workspaceProgressiveRevealQueue(firstUnit, revealed, [unit.node_id]), [component.node_id]);
});

test('node body remains draggable while the isolated chevron expands children', () => {
  const calls = [];
  const tree = WorkspaceGraphNode({ data: { ...projectWorkspaceGraph(graph)[0], locale: 'en',
    onExpand: (id, value) => calls.push(['expand', id, value]) } });
  function buttons(v) {
    if (!React.isValidElement(v)) return [];
    return [v.type === 'button' ? v : null, ...React.Children.toArray(v.props.children).flatMap(buttons)].filter(Boolean);
  }
  const [chevron] = buttons(tree);
  chevron.props.onClick({ stopPropagation: () => calls.push(['stopped']) });
  assert.deepEqual(calls, [['stopped'], ['expand', root.node_id, false]]);
  assert.equal(chevron.props['aria-expanded'], true);
  assert.match(chevron.props.className, /nodrag/);
  assert.doesNotMatch(renderToStaticMarkup(tree), /nodrag nopan min-w-0 flex-1/);
  assert.match(renderToStaticMarkup(tree), /-webkit-line-clamp:2/);
  assert.match(renderToStaticMarkup(tree), /text-overflow:ellipsis/);
});

test('individual branch expansion preserves the viewport while the explicit all-tree action may fit it', () => {
  const source = readFileSync(path.join(directory, 'workspace-dialog.tsx'), 'utf8');
  const individualStart = source.indexOf('const onExpand =');
  const individual = source.slice(individualStart, source.indexOf('const runActive =', individualStart));
  const allTreeStart = source.indexOf('const toggleAllNodes =');
  const allTree = source.slice(allTreeStart, source.indexOf('const nodes =', allTreeStart));
  assert.doesNotMatch(individual, /fitFlow|fitView|setFitRequest/);
  assert.match(allTree, /setFitRequest/);
  assert.match(source, /if \(fitRequest === 0\) return/);
  assert.match(source, /viewportByWorkspace/);
  assert.match(source, /onMoveEnd=\{rememberViewport\}/);
  assert.doesNotMatch(source, /\sfitView\s+fitViewOptions=/, 'a status-only node repaint must never queue another automatic fit');
  assert.match(source, /h-\[100dvh\] w-screen max-h-none max-w-none/);
  const flowNodes = source.slice(source.indexOf('const nodes = useMemo<FlowNode[]>'), source.indexOf('const edges = useMemo<Edge[]>'));
  assert.doesNotMatch(flowNodes, /animate-in|zoom-in|fade-in/, 'React Flow positioning wrapper must never receive transform animation');
  assert.match(source, /group relative h-\[144px\] w-\[260px\] animate-in/, 'only the inner card may animate');
});

test('learner-facing outcomes hide provider binding prefixes without mutating ordinary text', () => {
  for (const value of ['lo_1: Outcome', 'LO-2) Outcome', 'lo 3. Outcome']) assert.equal(workspaceLearningOutcomeLabel(value), 'Outcome');
  assert.equal(workspaceLearningOutcomeLabel('Outcome without binding'), 'Outcome without binding');
});

test('node colors describe exact Apply state instead of treating content_ready as applied', () => {
  const renderNode = value => renderToStaticMarkup(WorkspaceGraphNode({ data: {
    ...projectWorkspaceGraph({ ...graph, nodes: graph.nodes.map(node => node.node_id === root.node_id ? value : node) })[0],
    locale: 'en', onExpand() {},
  } }));
  const pending = renderNode({ ...root, applied: false, user_modified: false });
  assert.match(pending, /bg-slate-500/); assert.ok(pending.includes(workspaceCopy.en.pendingApply));
  const edited = renderNode({ ...root, applied: false, user_modified: true });
  assert.match(edited, /bg-amber-500/); assert.ok(edited.includes(workspaceCopy.en.editedPendingApply));
  const applied = renderNode({ ...root, applied: true, user_modified: true });
  assert.match(applied, /bg-emerald-500/); assert.ok(applied.includes(workspaceCopy.en.appliedSuccessfully));
  const proposal = renderToStaticMarkup(WorkspaceGraphNode({ data: {
    ...projectWorkspaceGraph({ ...graph, total_nodes: graph.nodes.length + 1, nodes: [...graph.nodes, media] })
      .find(item => item.node.node_id === media.node_id), locale: 'en', onExpand() {},
  } }));
  assert.match(proposal, /bg-green-500/); assert.doesNotMatch(proposal, /bg-sky-400/);
  assert.ok(proposal.includes(workspaceCopy.en.proposal));
});

test('mindmap uses a stable colored icon identity for every component and media discriminator', () => {
  const renderIcon = value => renderToStaticMarkup(WorkspaceGraphNode({ data: {
    node: value, locale: 'en', childCount: 0, expanded: false, onExpand() {}, position: { x: 0, y: 0 },
  } }));
  const componentIcons = {
    html: 'component-html', problem: 'component-problem', la_faq: 'component-faq',
    la_sortable: 'component-sortable', la_crossword: 'component-crossword', la_diagram: 'component-diagram',
  };
  for (const [component_type, icon] of Object.entries(componentIcons)) {
    const markup = renderIcon({ ...component, component_type });
    assert.match(markup, new RegExp(`data-workspace-node-icon="${icon}"`));
  }
  const video = renderIcon({ ...media, media_type: 'video' });
  assert.match(video, /data-workspace-node-icon="media-video"/); assert.match(video, /text-rose-600/);
  const infographic = renderIcon({ ...media, media_type: 'static_infographic' });
  assert.match(infographic, /data-workspace-node-icon="media-infographic"/); assert.match(infographic, /text-sky-600/);
});

for (const locale of ['en', 'vi']) {
  test(`${locale}: allowed/ready review has actual titles, outcomes, yellow modified badge, no write controls or IDs`, () => {
    const html = renderDialog({}, locale, { overviewDetails: [courseDetail, chapterDetail] });
    assert.ok(html.includes(workspaceCopy[locale].review));
    assert.ok(html.includes(workspaceCopy[locale].chapters));
    assert.ok(html.includes(workspaceCopy[locale].modified));
    assert.match(html, /Real chapter outcome/);
    assert.match(html, /Actual summary|Managers|Scenario assessment/);
    assert.ok(html.includes(workspaceCopy[locale].chapterCount));
    assert.ok(html.includes(workspaceCopy[locale].sectionCount));
    assert.ok(html.includes(workspaceCopy[locale].lessonCount));
    assert.ok(html.includes(workspaceCopy[locale].interactiveCount));
    assert.ok(html.includes(workspaceCopy[locale].prerequisites));
    assert.match(html, /xl:grid-cols-4/);
    assert.doesNotMatch(html, /lo_1:/i);
    assert.match(html, /Private course/);
    assert.match(html, /border-yellow-500/);
    assert.match(html, /max-w-5xl/);
    assert.match(html, /grid-cols-2/);
    assert.match(html, /border-b bg-card/);
    assert.ok(!html.includes(workspaceCopy[locale].unitProgress));
    assert.doesNotMatch(html, /Save, Reset and Apply are not connected|Lưu, Đặt lại và Áp dụng chưa được kết nối/);
    assert.doesNotMatch(html, /Rise Block|Block ID|root-private|chapter-private|workspace-component-1/);
    assert.doesNotMatch(html, /<button[^>]*>(Save|Reset|Apply|Lưu|Đặt lại|Áp dụng)<\/button>/);
    assert.equal(lastFlow.fitView, undefined, 'automatic fitting is lifecycle-owned and cannot be retriggered by Apply repaint');
    assert.equal(typeof lastFlow.onInit, 'function');
    assert.equal(typeof lastFlow.onMoveEnd, 'function');
    assert.equal(lastFlow.viewport, undefined, 'the browser-owned Flow viewport is not forced by a realtime snapshot');
    assert.equal(lastFlow.nodesDraggable, true);
    assert.equal(lastFlow.nodesConnectable, false);
    assert.equal(lastFlow.deleteKeyCode, null);
  });
  test(`${locale}: overview exposes card titles immediately and skeletons only their pending bodies`, () => {
    const html = renderDialog({ detail: null, selectedNodeId: null }, locale, { overviewDetails: [] });
    for (const label of [workspaceCopy[locale].summary, workspaceCopy[locale].audience,
      workspaceCopy[locale].strategy, workspaceCopy[locale].prerequisites, workspaceCopy[locale].outcomes]) {
      assert.ok(html.includes(label), `missing visible pending title: ${label}`);
    }
    assert.match(html, /Private course/); assert.match(html, /Private chapter/); assert.match(html, /animate-pulse/);
  });
  test(`${locale}: transient resnapshot metadata is not shown as a technical user banner`, () => {
    const html = renderDialog({ stale: true, error: { code: 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED', message: 'internal' } }, locale);
    assert.doesNotMatch(html, /WORKSPACE_EVENT_RESNAPSHOT_REQUIRED|Cần tải lại trạng thái bản thiết kế khoá học|Reload the draft state/);
  });
  for (const access of ['blocked', 'unknown']) test(`${locale}: ${access} hides cached private graph, details and overview data`, () => {
    const html = renderDialog({ access }, locale, { overviewDetails: [chapterDetail] });
    assert.doesNotMatch(html, /Private course|Private chapter|Real chapter outcome|Real detail title|Specific outcome|Author notes|1\/1/);
    assert.ok(html.includes(workspaceCopy[locale][access === 'blocked' ? 'unavailable' : 'unknown']));
  });
  test(`${locale}: pending data never manufactures ready content`, () => {
    const html = renderDialog({ graph: null, status: null, detail: null, selectedNodeId: null }, locale);
    assert.ok(html.includes(workspaceCopy[locale].emptyOverview));
    assert.doesNotMatch(html, /Private course|Real chapter outcome|1\/1/);
  });
  test(`${locale}: an active workspace without committed data shows skeletons, but terminal states do not`, () => {
    const active = renderDialog({ graph: null, status: { ...state.status, status: 'designing', node_count: 0, unit_count: 0, ready_unit_count: 0 }, detail: null, selectedNodeId: null }, locale);
    assert.match(active, /animate-pulse/);
    for (const label of [workspaceCopy[locale].chapterCount, workspaceCopy[locale].sectionCount,
      workspaceCopy[locale].lessonCount, workspaceCopy[locale].interactiveCount,
      workspaceCopy[locale].summary, workspaceCopy[locale].audience, workspaceCopy[locale].strategy,
      workspaceCopy[locale].prerequisites, workspaceCopy[locale].chapters, workspaceCopy[locale].outcomes]) {
      assert.ok(active.includes(label), `pre-graph overview must expose ${label}`);
    }
    const terminal = renderDialog({ graph: null, status: { ...state.status, status: 'needs_action', node_count: 0, unit_count: 0, ready_unit_count: 0 }, detail: null, selectedNodeId: null }, locale);
    assert.doesNotMatch(terminal, /animate-pulse/);
    assert.match(terminal, new RegExp(workspaceCopy[locale].terminalNeedsAction));
    assert.doesNotMatch(terminal, new RegExp(workspaceCopy[locale].emptyOverview));
  });
  test(`${locale}: terminal failure shows a safe actionable message without internal codes`, () => {
    const terminal = renderDialog({ graph: null, status: { ...state.status, status: 'needs_action', node_count: 0,
      unit_count: 0, ready_unit_count: 0, failure_code: 'ORCHESTRATION_V2_EXECUTION_RUNTIME_CHANGED',
      failure_stage: 'chapter_blueprint', failure_chapter_key: 'chapter-2' }, detail: null, selectedNodeId: null }, locale);
    assert.doesNotMatch(terminal, /animate-pulse/);
    assert.doesNotMatch(terminal, /ORCHESTRATION_V2_EXECUTION_RUNTIME_CHANGED|Error code|Mã lỗi/);
    assert.match(terminal, locale === 'vi' ? /Chương 2/ : /Chapter 2/);
    assert.match(terminal, locale === 'vi' ? /chưa được gửi đến AI/ : /not sent to the AI provider/);
  });
  test(`${locale}: final-check failure stays internal when committed lessons are available`, () => {
    const terminal = renderDialog({ status: { ...state.status, status: 'needs_action',
      failure_code: 'ORCHESTRATION_V2_FINALIZATION_INPUT_INVALID', failure_stage: 'finalize_course' } }, locale);
    assert.doesNotMatch(terminal, /ORCHESTRATION_V2_FINALIZATION_INPUT_INVALID|font-mono/);
    assert.doesNotMatch(terminal, locale === 'vi' ? /đã được tạo và lưu/ : /created and saved/);
    assert.doesNotMatch(terminal, new RegExp(workspaceCopy[locale].terminalReload));
    assert.match(terminal, /Private course/);
  });
  test(`${locale}: assessment source review stays internal when committed course data is available`, () => {
    const terminal = renderDialog({ status: { ...state.status, status: 'needs_action',
      failure_code: 'ASSESSMENT_REVIEW_REQUIRED', failure_stage: 'finalize_course' } }, locale, { onRefresh() {} });
    assert.doesNotMatch(terminal, locale === 'vi' ? /cần được rà soát lại theo tài liệu nguồn/ : /require source review/);
    assert.doesNotMatch(terminal, locale === 'vi' ? /kiểm tra chất lượng đánh giá/ : /reviewing assessment quality/);
    assert.doesNotMatch(terminal, new RegExp(workspaceCopy[locale].terminalNeedsAction));
    assert.doesNotMatch(terminal, new RegExp(workspaceCopy[locale].terminalReload));
    assert.doesNotMatch(terminal, locale === 'vi' ? /Sau khi xử lý nguyên nhân/ : /After resolving the cause/);
  });
}

for (const locale of ['en', 'vi']) test(`${locale}: pre-graph mindmap exposes node roles while skeletoning unknown content`, () => {
  const html = renderToStaticMarkup(h(WorkspacePendingSkeleton, { locale, stage: 'mindmap' }));
  for (const label of [workspaceCopy[locale].course, workspaceCopy[locale].chapter,
    workspaceCopy[locale].lesson, workspaceCopy[locale].unit, workspaceCopy[locale].component]) {
    assert.ok(html.includes(label), `pre-graph mindmap must expose ${label}`);
  }
  assert.match(html, /animate-pulse/);
  assert.match(html, /data-pending-mindmap-canvas="true"/);
  assert.match(html, /viewBox="0 0 1180 560"/);
  assert.match(html, /data-pending-edge-layer="true"/);
  for (const edge of ['course-chapter-top', 'course-chapter-bottom', 'chapter-top-unit',
    'chapter-top-lesson', 'chapter-bottom-component']) assert.match(html, new RegExp(`data-pending-edge="${edge}"`));
  assert.equal((html.match(/data-pending-edge-track="true"/g) ?? []).length, 5);
  assert.equal((html.match(/data-pending-edge-shimmer="true"/g) ?? []).length, 5);
  assert.match(html, /pending-map-edge-gradient/);
  assert.match(html, /pending-map-edge-shimmer/);
  assert.match(html, /bg-current\/\[0\.20\]/);
  assert.match(html, /bg-current\/\[0\.14\]/);
  assert.match(html, /dark:bg-current\/\[0\.13\]/);
  assert.match(html, /dark:bg-current\/\[0\.09\]/);
  assert.match(html, /stroke-dasharray="24 96"/);
  assert.equal((html.match(/attributeName="stroke-dashoffset"/g) ?? []).length, 5);
  assert.match(html, /d="M [^"]+ H [^"]+ Q [^"]+ V [^"]+ Q [^"]+ H [^"]+"/);
  assert.doesNotMatch(html, /data-pending-edge-column|left:calc\(|right:68%|right:35%/);
  assert.doesNotMatch(html, /Private course|Private chapter|Real chapter outcome/);
});

test('pre-graph shells never expose non-interactive planning preview data', () => {
  const preview = { run_id: '00000000-0000-4000-8000-000000000040', course_title: 'An toàn vận hành',
    total_chapters: 3, completed_chapters: 1, chapters: [
      { chapter_key: 'chapter-1', order: 0, title: 'Nhận diện mối nguy', state: 'ready' },
      { chapter_key: 'chapter-2', order: 1, title: 'Đánh giá rủi ro', state: 'generating' },
      { chapter_key: 'chapter-3', order: 2, title: 'Kiểm soát', state: 'planned' },
    ] };
  const overview = renderToStaticMarkup(h(WorkspacePendingSkeleton, { locale: 'vi', stage: 'overview', preview }));
  const mindmap = renderToStaticMarkup(h(WorkspacePendingSkeleton, { locale: 'vi', stage: 'mindmap', preview }));
  for (const text of ['An toàn vận hành', 'Nhận diện mối nguy', 'Đánh giá rủi ro', 'Kiểm soát']) {
    assert.doesNotMatch(overview, new RegExp(text)); assert.doesNotMatch(mindmap, new RegExp(text));
  }
  assert.doesNotMatch(mindmap, /1\/3/);
  assert.match(overview, /animate-pulse/, 'all values stay skeletonized until the interactive graph is committed');
  assert.match(mindmap, /animate-pulse/);
  assert.match(mindmap, /Nội dung sẽ hiển thị và có thể tương tác khi sẵn sàng/);
  assert.doesNotMatch(`${overview}${mindmap}`, /source_scope|provider|PRIVATE/);
});

test('stale detail, mismatched revision/identity and local drafts are never shown as committed content', () => {
  for (const patch of [{ detailStale: true }, { detail: { ...chapterDetail, current_revision: 1 } },
    { detail: { ...chapterDetail, workspace_id: 'other-workspace' } }, { detail: { ...chapterDetail, node_id: unit.node_id } }]) {
    assert.doesNotMatch(renderDialog(patch), /Real chapter outcome|Specific outcome/);
  }
  assert.doesNotMatch(renderDialog({ detail: null, drafts: { [chapter.node_id]: { content: { title: 'SECRET UNSAVED' } } } }), /SECRET UNSAVED/);
  const html = renderToStaticMarkup(h(WorkspaceNodeDetail, { node: chapter, detail: chapterDetail, locale: 'en', stale: true, onClose() {} }));
  assert.ok(html.includes(workspaceCopy.en.detailStale));
  assert.doesNotMatch(html, /Real chapter outcome/);
});

test('closed store hides retained allowed data during reopen before the host starts authorization', () => {
  assert.doesNotMatch(renderDialog({ opened: false }, 'en', { overviewDetails: [chapterDetail] }),
    /Private course|Private chapter|Real chapter outcome|Real detail title|Specific outcome|1\/1/);
});

test('types are protected discriminators: missing/null/wrong type never inferred from shape or validation contract', () => {
  const raw = { items: [{ id: 1, question: 'secret Q', answer: 'secret A' }, { id: 2, question: 'Other', answer: 'Other A' }] };
  for (const type of [undefined, null, 'html', 'unrecognized']) {
    const d = detail(type, raw);
    assert.equal(readWorkspacePreview(d), null);
    const html = renderDetail(d);
    assert.ok(html.includes(workspaceCopy.en.unsupported));
    assert.doesNotMatch(html, /secret Q|secret A|"items"/);
  }
});

test('HTML renders readable inert content without raw source, source attributes, active elements or external assets', () => {
  const html = renderDetail(detail('html', '<h2 id="private-id" style="background:url(https://bad.test)" onclick="alert(1)">Real heading</h2><p>Hello <b>world</b></p><a href="javascript:alert(1)">Link text</a><script>secretScript()</script><style>secretCss</style><iframe src="https://bad.test"></iframe><img src="https://bad.test" onerror="alert(1)"><svg onload="alert(1)"></svg><form><input value="secretInput"></form>'));
  assert.match(html, /<h2>Real heading<\/h2>/);
  assert.match(html, /Hello <b>world<\/b>/);
  assert.match(html, /Link text/);
  assert.doesNotMatch(html, /private-id|onclick|onerror|onload|javascript:|https:\/\/bad|secretScript|secretCss|secretInput|<script|<iframe|<img|<svg[^>]+onload|<form|<input|&lt;h2/);
});

test('all five problem subtypes retain questions, answer mapping, explanation and subtype fields as escaped text', () => {
  for (const kind of ['multiple_choice', 'multiple_select', 'dropdown', 'short_text', 'numerical']) {
    const data = { kind, question: 'Question <img src=x>', explanation: 'Actual explanation',
      ...(['short_text', 'numerical'].includes(kind) ? { answers: ['42'], ...(kind === 'short_text' ? { case_sensitive: true } : { tolerance: '2%' }) }
        : { choices: [{ text: 'Right', correct: true }, { text: 'Wrong', correct: false }] }) };
    const html = renderDetail(detail('problem', data));
    assert.match(html, /Question &lt;img src=x&gt;/);
    assert.match(html, /Actual explanation/);
    assert.doesNotMatch(html, /<img/);
    if (kind === 'numerical') assert.match(html, /2%/);
    else if (kind === 'short_text') assert.match(html, /Case sensitive/);
    else assert.match(html, /Not a correct answer/);
  }
  assert.equal(readWorkspacePreview(detail('problem', { kind: 'short_text', question: 'Q', answers: 'not an array' })), null);
});

test('FAQ, order, crossword and aggregate fields show actual data in review cards without protected item IDs', () => {
  assert.match(renderDetail(detail('la_faq', { items: [{ id: 'hidden-id', question: 'Q one', answer: 'A one' }, { id: 2, question: 'Q two', answer: 'A two' }] })), /A one/);
  const order = renderDetail(detail('la_sortable', { question_text: 'Order task', items: ['First', 'Second', 'Third'].map((text, id) => ({ id, text })) }));
  assert.ok(order.indexOf('First') < order.indexOf('Second'));
  const words = ['CAT', 'DOG', 'BEE'].map((answer, row) => ({ id: `hidden-${row}`, answer, row, col: 0, direction: 'across', clue: `Clue ${row}`, hint: 'Hint text' }));
  const crosswordHtml = renderDetail(detail('la_crossword', { words, keyword_coordinates: [{ row: 0, col: 1 }] }));
  assert.match(crosswordHtml, /CAT/); assert.match(crosswordHtml, /Column 2/); assert.doesNotMatch(crosswordHtml, /hidden-/);
  assert.equal(readWorkspacePreview(detail('la_crossword', { words, keyword_coordinates: [{ row: 9, col: 9 }] })), null);
  const courseHtml = renderDetail(detail(null, { summary: 'Actual summary', target_audience: 'Managers', prerequisites: ['Experience'], assessment_strategy: 'Scenario assessment' }, root));
  assert.match(courseHtml, /Actual summary/); assert.match(courseHtml, /Managers/);
  assert.match(courseHtml, /rounded-2xl/); assert.match(courseHtml, /uppercase/);
  const lessonHtml = renderDetail(detail(null, { objective: 'Objective', learning_objectives: ['Outcome'], learning_activities: ['Discuss'], assessment: 'Case study' }, lesson));
  assert.match(lessonHtml, /Discuss/); assert.match(lessonHtml, /Case study/);
  assert.match(lessonHtml, /bg-violet-500\/10 text-violet-600 dark:text-violet-400/,
    'learning-objective bullets inherit the violet review-card accent');
  assert.match(lessonHtml, /bg-amber-500\/10 text-amber-600 dark:text-amber-400/,
    'learning-activity bullets inherit the amber review-card accent');
  assert.doesNotMatch(lessonHtml, /bg-primary\/10 text-primary/,
    'colored review cards do not fall back to unrelated primary-blue bullets');
  assert.match(lessonHtml, /grid-cols-\[2rem_minmax\(0,1fr\)\] items-start gap-2.5/,
    'review rows reserve the same 32px icon column used by the card heading');
  assert.match(lessonHtml, /flex h-5 w-8 shrink-0 items-center justify-center/,
    'small status icons are centered beneath the larger card icon');
  assert.ok((lessonHtml.match(/md:col-span-2/g) ?? []).length >= 4,
    'long objective and activity cards use the full review width instead of wrapping in a half-empty column');
});

test('hierarchy detail counts committed descendants and labels lesson outcomes and interaction types', () => {
  const chapterNode = { ...chapter, canonical_path: 'course.chapter_1' };
  const sectionNode = { ...lesson, canonical_path: 'course.chapter_1.section_1' };
  const lessonNode = { ...unit, canonical_path: 'course.chapter_1.section_1.lesson_1' };
  const htmlNode = { ...component, canonical_path: 'course.chapter_1.section_1.lesson_1.component_1', component_type: 'html' };
  const quizNode = { ...component, node_id: 'quiz-private', canonical_path: 'course.chapter_1.section_1.lesson_1.component_2', component_type: 'problem' };
  const stats = workspaceDetailStats(chapterNode, [chapterNode, sectionNode, lessonNode, htmlNode, quizNode]);
  assert.deepEqual(stats, { sectionCount: 1, lessonCount: 1, interactionCount: 2, componentTypes: ['html', 'problem'] });
  const unitDetail = { ...detail(null, {}, lessonNode), content: { ...detail(null, {}, lessonNode).content, purpose: 'Learner result' } };
  const html = renderDetail(unitDetail, 'en', workspaceDetailStats(lessonNode, [chapterNode, sectionNode, lessonNode, htmlNode, quizNode]));
  for (const value of ['What learners will achieve', 'Learner result', 'Interactive content types', 'Theory', 'Quiz']) assert.ok(html.includes(value));
});

test('component author analysis always renders four read-only review cards with N/A fallback', () => {
  const reviewed = { ...detail('html', '<p>Content</p>'), author_review: {
    purpose: 'Purpose analysis', example_scenario: null, visual_asset: 'Visual analysis', user_behavior_navigation: null,
  } };
  const html = renderDetail(reviewed, 'en');
  for (const value of ['Purpose analysis', 'Example / illustrative situation', 'Visual analysis', 'Learner behavior / navigation', 'N/A']) assert.ok(html.includes(value));
});

test('media briefs require server media type and render metadata only, including honest missing context', () => {
  const d = detail(null, { content_points: ['Brief point'], context_description: null }, media);
  assert.ok(renderDetail(d).includes(workspaceCopy.en.unsupported));
  for (const media_type of ['video', 'static_infographic']) {
    const html = renderDetail({ ...d, media_type });
    assert.match(html, /Brief point/); assert.ok(html.includes(workspaceCopy.en.noContext));
    assert.doesNotMatch(html, /<video|<img|<iframe|src=/);
  }
});

test('diagram safely projects Course Outline renderer fields instead of rejecting bot output', () => {
  const data = { start_diagram_id: 'diagram-secret', diagrams: [{ id: 'diagram-secret', name: 'Actual diagram',
    nodes: ['A', 'B'].map((label, i) => ({ id: `n${i}`, type: 'customShape', position: { x: i * 200, y: 0 },
      data: { label } })),
    edges: [{ id: 'edge-secret', source: 'n0', target: 'n1', label: 'Relationship' }],
  }] };
  const html = renderDetail(detail('la_diagram', data));
  assert.match(html, /Actual diagram/); assert.match(html, /A → B: Relationship/);
  assert.doesNotMatch(html, /diagram-secret|edge-secret/);
  assert.equal(lastDiagram.diagrams[0].nodes[0].style, undefined);
  assert.equal(lastDiagram.diagrams[0].nodes[0].data.url, undefined);
  const extra = globalThis.structuredClone(data);
  extra.diagrams[0].nodes[0].data.url = 'https://bad.test';
  extra.diagrams[0].nodes[0].data.target_diagram_id = '';
  extra.diagrams[0].nodes[0].style = { backgroundImage: 'url(https://bad.test)' };
  extra.diagrams[0].edges[0].type = 'deletable';
  extra.diagrams[0].edges[0].style = { stroke: '#64748B' };
  extra.diagrams[0].edges[0].data = { routing: 'orthogonal', feedbackSide: 'right' };
  const projected = readWorkspacePreview(detail('la_diagram', extra));
  assert.equal(projected?.type, 'la_diagram');
  assert.equal(projected.data.diagrams[0].nodes[0].style, undefined);
  assert.equal(projected.data.diagrams[0].nodes[0].data.url, undefined);
  assert.equal(projected.data.diagrams[0].edges[0].style, undefined);
  assert.equal(projected.data.diagrams[0].edges[0].data.feedbackSide, undefined);
  assert.equal(projected.data.diagrams[0].edges[0].data.routing, 'orthogonal');
  const invalid = globalThis.structuredClone(data); invalid.diagrams[0].edges[0].target = 'missing';
  assert.equal(readWorkspacePreview(detail('la_diagram', invalid)), null);
});
