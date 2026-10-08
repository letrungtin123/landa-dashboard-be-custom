import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Background, BaseEdge, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider, getSmoothStepPath, useEdgesState, useNodesState, type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle, Blocks, BookOpenCheck, CheckCircle2, ChevronDown, ChevronRight, CircleDot, FileText,
  GitBranch, Grid3X3, HelpCircle, Image as ImageIcon, Info, ListOrdered, ListTree, Map as MapIcon,
  MessageCircleQuestion, Network, Rows3, Target, Video, Workflow,
} from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { workspaceReadMessage, type WorkspaceArchitecturePreview, type WorkspaceArchitecturePreviewState, type WorkspaceFailureStage, type WorkspaceGraph, type WorkspaceLocale, type WorkspaceNode, type WorkspaceStatus } from '../../api/lesson-author-workspace.contract';
import type { WorkspaceReadState } from './workspace-read-state';
import { WorkspaceAggregateContent, WorkspaceCourseOverviewSkeleton, WorkspaceNodeDetail, workspaceCopy, workspaceRunEnded, workspaceDetailMatches, workspaceLearningOutcomeLabel, type WorkspaceTypedDetail } from './workspace-node-detail';
import { WorkspaceAiAvatar } from './workspace-ai-avatar';

type Expansion = Readonly<Record<string, boolean>>;
export interface WorkspaceProjectionNode {
  node: WorkspaceNode;
  position: { x: number; y: number };
  childCount: number;
  expanded: boolean;
  /** Presentation-only progress nodes never grant detail/edit/apply authority. */
  preview: boolean;
  previewState: WorkspaceArchitecturePreviewState | null;
}

interface WorkspacePresentationNode {
  node: WorkspaceNode;
  preview: boolean;
  previewState: WorkspaceArchitecturePreviewState | null;
}

function layoutWorkspaceNodes(nodes: readonly WorkspacePresentationNode[], expansion: Expansion): WorkspaceProjectionNode[] {
  const children = new Map<string | null, WorkspacePresentationNode[]>();
  for (const item of nodes) {
    const siblings = children.get(item.node.parent_id) ?? [];
    siblings.push(item); children.set(item.node.parent_id, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => {
    const mediaRank = (item: WorkspacePresentationNode) => item.node.kind === 'media_brief' ? 0 : 1;
    return mediaRank(a) - mediaRank(b) || a.node.sort_order - b.node.sort_order || a.node.node_id.localeCompare(b.node.node_id);
  });
  const output: WorkspaceProjectionNode[] = [];
  const seen = new Set<string>();
  let leafIndex = 0;
  const depthGap = 330, rowGap = 180;
  function visit(item: WorkspacePresentationNode, depth: number): number | null {
    const node = item.node;
    if (seen.has(node.node_id)) return null;
    seen.add(node.node_id);
    const descendants = children.get(node.node_id) ?? [];
    const expanded = expansion[node.node_id] ?? true;
    const projected: WorkspaceProjectionNode = { ...item, position: { x: 0, y: 0 }, childCount: descendants.length, expanded };
    output.push(projected);
    const childYs = expanded ? descendants.map(child => visit(child, depth + 1)).filter((value): value is number => value !== null) : [];
    const y = childYs.length ? (Math.min(...childYs) + Math.max(...childYs)) / 2 : leafIndex++ * rowGap;
    projected.position = { x: depth * depthGap + 40, y: y + 40 };
    return y;
  }
  for (const root of children.get(null) ?? []) visit(root, 0);
  return output;
}

/** Committed graph only. Stable server identity/order, never title matching or
 * planned/generated payload synthesis. Prune hidden descendants before Flow. */
export function projectWorkspaceGraph(graph: WorkspaceGraph | null, expansion: Expansion = {}): WorkspaceProjectionNode[] {
  // A graph page is interactive authority once the complete committed snapshot
  // has been read. `structure_ready` means every planned branch exists; it must
  // not hide already committed nodes while generation is active or after a
  // terminal partial-success run. Planned/provider preview data never reaches
  // this function, so partial success cannot be mistaken for a loading shell.
  if (!graph || graph.has_more || graph.nodes.length === 0 || graph.nodes.length !== graph.total_nodes) return [];
  return layoutWorkspaceNodes(graph.nodes.map(node => ({ node, preview: false, previewState: null })), expansion);
}

/** Merge durable planning progress with the committed graph. Committed nodes
 * always win by both deterministic ID and canonical path. The preview is only
 * a visual progress surface and is never returned to detail/write/apply code. */
export function workspacePresentationNodes(
  graph: WorkspaceGraph | null,
  preview: WorkspaceArchitecturePreview | null | undefined,
): WorkspacePresentationNode[] {
  const graphComplete = !!graph && !graph.has_more && graph.nodes.length === graph.total_nodes;
  const committed = graphComplete ? graph.nodes : [];
  if (!preview) return committed.map(node => ({ node, preview: false, previewState: null }));
  const committedIds = new Set(committed.map(node => node.node_id.toLowerCase()));
  const committedPaths = new Set(committed.map(node => node.canonical_path));
  const planning = preview.nodes.filter(node => !committedIds.has(node.node_id.toLowerCase())
    && !committedPaths.has(node.canonical_path)).map(node => ({
    preview: true,
    previewState: node.state,
    node: {
      node_id: node.node_id,
      parent_id: node.parent_id,
      kind: node.kind,
      canonical_path: node.canonical_path,
      sort_order: node.sort_order,
      content_state: node.state === 'planned' ? 'planned' : node.state === 'needs_action' ? 'needs_action' : 'generating',
      current_revision: null,
      component_type: node.component_type,
      media_type: node.media_type,
      title: node.title,
      user_modified: false,
      applied: false,
      content_origin: null,
      quality_state: null,
    } satisfies WorkspaceNode,
  }));
  return [...planning, ...committed.map(node => ({ node, preview: false, previewState: null }))];
}

export function projectWorkspaceLiveGraph(
  graph: WorkspaceGraph | null,
  preview: WorkspaceArchitecturePreview | null | undefined,
  expansion: Expansion = {},
): WorkspaceProjectionNode[] {
  return layoutWorkspaceNodes(workspacePresentationNodes(graph, preview), expansion);
}

/** Deterministic presentation queue over server-visible nodes only. This never
 * invents topology or content; it merely prevents multiple committed snapshots
 * received in one browser tick from painting as one opaque block. */
export function workspaceProgressiveRevealQueue(
  graph: WorkspaceGraph | null,
  revealed: ReadonlySet<string>,
  queued: readonly string[] = [],
): string[] {
  const admitted = new Set([...revealed, ...queued]);
  return projectWorkspaceGraph(graph, {}).map(item => item.node.node_id).filter(nodeId => !admitted.has(nodeId));
}

/** "Collapse all" keeps the course index useful: the course and every chapter
 * stay visible while section/lesson/content descendants are folded away. */
export function collapseWorkspaceToChapterLevel(graph: WorkspaceGraph | null): Expansion {
  if (!graph) return {};
  const expandable = new Set(graph.nodes.map(node => node.parent_id).filter((id): id is string => id !== null));
  const courses = new Set(graph.nodes.filter(node => node.kind === 'course').map(node => node.node_id));
  return Object.fromEntries([...expandable].map(id => [id, courses.has(id)]));
}

/** Collapse a branch as one state transition. Descendant expansion flags must
 * not survive invisibly: otherwise reopening a parent remounts the whole old
 * subtree at once and produces a large, disorienting layout jump. */
export function collapseWorkspaceBranch(graph: WorkspaceGraph | null, expansion: Expansion, nodeId: string): Expansion {
  if (!graph) return { ...expansion, [nodeId]: false };
  const children = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!node.parent_id) continue;
    const ids = children.get(node.parent_id) ?? [];
    ids.push(node.node_id); children.set(node.parent_id, ids);
  }
  const next = { ...expansion } as Record<string, boolean>;
  const pending = [nodeId];
  while (pending.length) {
    const current = pending.pop()!;
    next[current] = false;
    pending.push(...(children.get(current) ?? []));
  }
  return next;
}

function collapsePresentationBranch(nodes: readonly WorkspacePresentationNode[], expansion: Expansion, nodeId: string): Expansion {
  const children = new Map<string, string[]>();
  for (const { node } of nodes) {
    if (!node.parent_id) continue;
    const ids = children.get(node.parent_id) ?? [];
    ids.push(node.node_id); children.set(node.parent_id, ids);
  }
  const next = { ...expansion } as Record<string, boolean>;
  const pending = [nodeId];
  while (pending.length) {
    const current = pending.pop()!;
    next[current] = false;
    pending.push(...(children.get(current) ?? []));
  }
  return next;
}

function collapsePresentationToChapterLevel(nodes: readonly WorkspacePresentationNode[]): Expansion {
  const expandable = new Set(nodes.map(item => item.node.parent_id).filter((id): id is string => id !== null));
  const courses = new Set(nodes.filter(item => item.node.kind === 'course').map(item => item.node.node_id));
  return Object.fromEntries([...expandable].map(id => [id, courses.has(id)]));
}

/** Choose the initial tree mode once per modal open. Active runs stay open so
 * committed units appear live; reopening a terminal run starts at the useful
 * course + chapter index instead of rendering the complete tree at once. */
export function initialWorkspaceExpansion(graph: WorkspaceGraph | null, status: WorkspaceStatus | null): Expansion | null {
  if (!graph || graph.has_more || graph.nodes.length === 0 || graph.nodes.length !== graph.total_nodes || !status) return null;
  if (['queued', 'designing', 'drafting'].includes(status.status)) return {};
  return collapseWorkspaceToChapterLevel(graph);
}

/** Exact committed graph counts used by Overview. Media briefs are planning
 * metadata, not imported interactive course components, and are excluded. */
export function workspaceOverviewCounts(graph: WorkspaceGraph | null) {
  const nodes = graph?.nodes ?? [];
  return {
    chapters: nodes.filter(node => node.kind === 'chapter').length,
    sections: nodes.filter(node => node.kind === 'lesson').length,
    lessons: nodes.filter(node => node.kind === 'unit').length,
    interactive: nodes.filter(node => node.kind === 'component').length,
  } as const;
}

type FlowData = Record<string, unknown> & WorkspaceProjectionNode & {
  locale: WorkspaceLocale; onExpand: (id: string, expanded: boolean) => void;
  /** The run has ended: planned/generating nodes are no longer being built. */
  runEnded?: boolean;
};
type FlowNode = Node<FlowData, 'workspace'>;
type WorkspaceBuildEdgeData = Record<string, unknown> & {
  active: boolean;
  color: string;
  delaySeconds: number;
};
type WorkspaceBuildEdge = Edge<WorkspaceBuildEdgeData, 'workspaceBuild'>;

const maxAnimatedWorkspaceEdges = 8;

export function workspaceBuildingNodeIds(
  items: readonly Pick<WorkspaceProjectionNode, 'node' | 'preview' | 'previewState'>[],
  limit = maxAnimatedWorkspaceEdges,
  runEnded = false,
): string[] {
  if (limit <= 0 || runEnded) return [];
  return items.filter(item => item.node.parent_id !== null && (item.preview
    ? item.previewState !== 'needs_action'
    : item.node.content_state === 'planned' || item.node.content_state === 'generating'))
    .slice(0, limit)
    .map(item => item.node.node_id);
}

/** Mirrors the established Blueprint mindmap visual contract on `main`.
 * Workspace state is deliberately mapped only for presentation; it never
 * changes the server-owned workspace state machine. */
type WorkspaceMindmapStatus = 'applied' | 'pending' | 'edited' | 'proposal';

const statusClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
  pending: 'border-slate-300/60 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
  edited: 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200',
  proposal: 'border-green-300/70 bg-green-50 text-green-700 dark:border-green-700/70 dark:bg-green-950/40 dark:text-green-200',
};

const nodeShellClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-emerald-950/5 dark:border-emerald-700 dark:bg-emerald-950/55 dark:text-emerald-50',
  pending: 'border-slate-300 bg-slate-50 text-slate-950 shadow-slate-950/5 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-50',
  edited: 'border-yellow-500 bg-yellow-50 text-yellow-950 shadow-yellow-950/5 dark:border-yellow-600 dark:bg-yellow-950/55 dark:text-yellow-50',
  proposal: 'border-green-400 bg-green-50 text-green-950 shadow-green-950/10 dark:border-green-600 dark:bg-green-950/55 dark:text-green-50',
};

const nodeAccentClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'bg-emerald-500',
  pending: 'bg-slate-500',
  edited: 'bg-amber-500',
  proposal: 'bg-green-500',
};

const edgeColor: Record<WorkspaceMindmapStatus, string> = {
  applied: '#10b981',
  pending: '#94a3b8',
  edited: '#f59e0b',
  proposal: '#22c55e',
};

type WorkspaceNodeVisualSource = Pick<WorkspaceNode, 'kind' | 'component_type' | 'media_type'>;

/** Status belongs to the card surface; content identity belongs to the icon.
 * Keeping these channels independent prevents a quiz, diagram or media brief
 * from turning back into the same generic question-mark glyph. */
function getWorkspaceNodeVisual(node: WorkspaceNodeVisualSource) {
  if (node.kind === 'course') return { Icon: Network, key: 'course', tone: 'text-blue-600 dark:text-blue-300' };
  if (node.kind === 'chapter') return { Icon: GitBranch, key: 'chapter', tone: 'text-violet-600 dark:text-violet-300' };
  if (node.kind === 'lesson') return { Icon: CircleDot, key: 'lesson', tone: 'text-cyan-600 dark:text-cyan-300' };
  if (node.kind === 'unit') return { Icon: MapIcon, key: 'unit', tone: 'text-emerald-600 dark:text-emerald-300' };
  if (node.kind === 'media_brief') {
    if (node.media_type === 'video') return { Icon: Video, key: 'media-video', tone: 'text-rose-600 dark:text-rose-300' };
    return { Icon: ImageIcon, key: 'media-infographic', tone: 'text-sky-600 dark:text-sky-300' };
  }
  if (node.kind === 'component') {
    if (node.component_type === 'html') return { Icon: FileText, key: 'component-html', tone: 'text-sky-600 dark:text-sky-300' };
    if (node.component_type === 'problem') return { Icon: HelpCircle, key: 'component-problem', tone: 'text-rose-600 dark:text-rose-300' };
    if (node.component_type === 'la_faq') return { Icon: MessageCircleQuestion, key: 'component-faq', tone: 'text-violet-600 dark:text-violet-300' };
    if (node.component_type === 'la_sortable') return { Icon: ListOrdered, key: 'component-sortable', tone: 'text-orange-600 dark:text-orange-300' };
    if (node.component_type === 'la_crossword') return { Icon: Grid3X3, key: 'component-crossword', tone: 'text-fuchsia-600 dark:text-fuchsia-300' };
    if (node.component_type === 'la_diagram') return { Icon: Workflow, key: 'component-diagram', tone: 'text-teal-600 dark:text-teal-300' };
    return { Icon: Blocks, key: 'component', tone: 'text-slate-600 dark:text-slate-300' };
  }
  return { Icon: FileText, key: 'content', tone: 'text-slate-600 dark:text-slate-300' };
}

function workspaceBuildAccent(node: WorkspaceNodeVisualSource): string {
  if (node.kind === 'course') return '#3b82f6';
  if (node.kind === 'chapter') return '#8b5cf6';
  if (node.kind === 'lesson') return '#06b6d4';
  if (node.kind === 'unit' || node.kind === 'media_brief') return '#10b981';
  if (node.component_type === 'html') return '#0ea5e9';
  if (node.component_type === 'problem') return '#f43f5e';
  if (node.component_type === 'la_faq') return '#8b5cf6';
  if (node.component_type === 'la_sortable') return '#f97316';
  if (node.component_type === 'la_crossword') return '#d946ef';
  if (node.component_type === 'la_diagram') return '#14b8a6';
  return '#f59e0b';
}

const workspaceComponentLabelKeys = {
  html: 'componentHtml', problem: 'componentProblem', la_faq: 'componentFaq',
  la_sortable: 'componentSortable', la_crossword: 'componentCrossword', la_diagram: 'componentDiagram',
} as const;

/** Component pills use only the server-owned discriminator. Never infer a
 * content type from a generated title or payload shape. */
export function workspaceNodeTypeLabel(node: Pick<WorkspaceNode, 'kind' | 'component_type' | 'media_type'>, locale: WorkspaceLocale): string {
  const c = workspaceCopy[locale];
  if (node.kind === 'component') {
    const key = node.component_type ? workspaceComponentLabelKeys[node.component_type] : undefined;
    return key ? c[key] : c.component;
  }
  if (node.kind === 'media_brief') {
    if (node.media_type === 'video') return c.mediaVideo;
    if (node.media_type === 'static_infographic') return c.mediaInfographic;
  }
  return c[node.kind];
}

function workspaceMindmapStatus(node: Pick<WorkspaceNode, 'kind' | 'applied' | 'user_modified'>): WorkspaceMindmapStatus {
  // Apply wins after a successful exact-revision receipt. A later Save changes
  // the revision, so the server projection becomes false and the node is yellow.
  if (node.kind === 'media_brief') return 'proposal';
  if (node.applied) return 'applied';
  if (node.user_modified) return 'edited';
  return 'pending';
}

/** Shared by the graph card and detail header so type copy and Apply-state
 * color cannot drift between the two presentations. */
export function WorkspaceNodeTypePill({ node, locale }: { node: WorkspaceNode; locale: WorkspaceLocale }) {
  const status = workspaceMindmapStatus(node);
  return <Badge variant="outline" className={`h-5 rounded-full px-2 text-[10px] font-semibold ${statusClassName[status]}`}>
    {workspaceNodeTypeLabel(node, locale)}
  </Badge>;
}

function WorkspaceBuildBeacon({ active = true }: { active?: boolean }) {
  return <span data-workspace-build-beacon={active ? 'active' : 'idle'}
    className={`workspace-build-beacon ${active ? 'workspace-build-beacon-active' : 'workspace-build-beacon-idle'}`} aria-hidden>
    <span /><span /><span />
  </span>;
}

function WorkspaceFlowBuildEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  markerEnd, style, data }: EdgeProps<WorkspaceBuildEdge>) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    borderRadius: 14, offset: 22 });
  const color = data?.color ?? '#3b82f6';
  return <>
    <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
    {data?.active && <path data-workspace-build-edge="active" d={edgePath} fill="none" stroke={color}
      strokeWidth="2.75" strokeLinecap="round" className="workspace-build-edge-flow" aria-hidden
      style={{ animationDelay: `-${data.delaySeconds}s` }} />}
  </>;
}

export function WorkspaceGraphNode({ data, selected }: NodeProps<FlowNode>) {
  const { node, locale, childCount, expanded, onExpand, preview, previewState, runEnded = false } = data;
  const c = workspaceCopy[locale];
  const status = workspaceMindmapStatus(node);
  const { Icon, key: iconKey, tone: iconTone } = getWorkspaceNodeVisual(node);
  const kindLabel = workspaceNodeTypeLabel(node, locale);
  const previewLabel = previewState === 'ready' ? (locale === 'vi' ? 'Đang đồng bộ' : 'Syncing')
    : previewState === 'needs_action' ? (locale === 'vi' ? 'Cần kiểm tra' : 'Needs review')
      : previewState === 'planned' ? c.planned : c.generating;
  const unfinished = preview ? previewState === 'planned' || previewState === 'generating'
    : node.content_state === 'planned' || node.content_state === 'generating';
  const notGenerated = runEnded && unfinished;
  const stateLabel = notGenerated ? c.notGenerated : preview ? previewLabel : status === 'proposal' ? c.proposal : status === 'applied' ? c.appliedSuccessfully
    : status === 'edited' ? c.editedPendingApply : node.content_state === 'content_ready' ? c.pendingApply : c[node.content_state];
  const building = !runEnded && (preview ? previewState !== 'needs_action' : unfinished);
  const buildStyle = building ? { '--workspace-build-accent': workspaceBuildAccent(node) } as CSSProperties : undefined;
  return <div className={`group relative h-[144px] w-[260px] animate-in overflow-hidden rounded-lg border shadow-md transition-shadow duration-200 ${nodeShellClassName[status]}
    ${building ? 'workspace-build-node' : ''}
    ${selected ? 'ring-2 ring-primary/35 shadow-xl' : 'hover:shadow-lg'} ${preview ? 'cursor-progress' : 'cursor-grab active:cursor-grabbing'}`}
    data-workspace-preview={preview ? previewState ?? 'generating' : undefined}
    data-workspace-building={building || undefined} aria-disabled={preview || undefined} style={buildStyle}>
    <Handle id="left" type="target" position={Position.Left} isConnectable={false}
      className="!h-3 !w-3 !border-2 !border-background !bg-primary !opacity-0 transition-opacity group-hover:!opacity-100" />
    <Handle id="right" type="source" position={Position.Right} isConnectable={false}
      className="!h-3 !w-3 !border-2 !border-background !bg-primary !opacity-0 transition-opacity group-hover:!opacity-100" />
    <div className={`h-1.5 w-full transition-opacity ${nodeAccentClassName[status]} ${building ? 'opacity-0' : ''}`} />
    <div className="p-3">
    <div className="flex items-start gap-3">
      <span data-workspace-node-icon={iconKey} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/80 ring-1 ring-current/10 ${iconTone}`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="flex flex-wrap gap-1.5"><WorkspaceNodeTypePill node={node} locale={locale} />
            <Badge variant="secondary" className="h-5 gap-1 rounded-md bg-background/70 px-1.5 text-[10px]">
              {building && <WorkspaceBuildBeacon />}
              {(notGenerated || (preview && previewState === 'needs_action')) && <AlertTriangle className="h-3 w-3" aria-hidden />}{stateLabel}
            </Badge></span>
            <span className="mt-2 block h-10 min-w-0 max-w-full overflow-hidden break-words text-sm font-semibold leading-5 text-foreground" title={node.title ?? undefined}
              style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, textOverflow: 'ellipsis' }}>{node.title ?? kindLabel}</span>
            {childCount > 0 && <span className="mt-1 block text-[11px] text-muted-foreground">{expanded ? `${childCount} ${locale === 'vi' ? 'mục đang mở' : 'items shown'}` : `${childCount} ${locale === 'vi' ? 'mục con' : 'child items'}`}</span>}
          </span>
      {childCount > 0 && <button type="button" className="nodrag nopan mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground ring-1 ring-current/10 transition-colors group-hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-expanded={expanded} aria-label={`${expanded ? c.collapse : c.expand}: ${node.title ?? c[node.kind]}`}
        onClick={event => { event.stopPropagation(); onExpand(node.node_id, !expanded); }}>
        {expanded ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
      </button>}
    </div>
    </div>
  </div>;
}
const nodeTypes = { workspace: WorkspaceGraphNode };
const edgeTypes = { workspaceBuild: WorkspaceFlowBuildEdge };

export interface WorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: Readonly<WorkspaceReadState>;
  locale: WorkspaceLocale;
  /** Host calls read-state.selectNode; this component does not create a client. */
  onSelectNode: (nodeId: string | null) => void;
  /** Optional authorized reads, keyed/checked by node ID + current revision.
   * Current READ v1 has no batch overview. Never pass a Blueprint fallback. */
  overviewDetails?: readonly WorkspaceTypedDetail[];
  toolbar?: ReactNode;
  renderNodeDetail?: (node: WorkspaceNode | null) => ReactNode;
  assistantAvatarSrc?: string | null;
  /** Authorized conversation display name for this exact workspace. */
  draftTitle?: string | null;
  /** Explicit, authorized read only. Never starts or retries generation. */
  onRefresh?: () => void;
}

const pendingOverviewMetrics = (locale: WorkspaceLocale) => {
  const c = workspaceCopy[locale];
  return [
    { label: c.chapterCount, icon: GitBranch, accent: '#3b82f6', tone: 'text-primary bg-primary/10 border-primary/20' },
    { label: c.sectionCount, icon: ListTree, accent: '#8b5cf6', tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20 dark:text-violet-300' },
    { label: c.lessonCount, icon: BookOpenCheck, accent: '#10b981', tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300' },
    { label: c.interactiveCount, icon: Blocks, accent: '#f59e0b', tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300' },
  ] as const;
};

const pendingNodeTone = {
  course: 'border-blue-500/30 bg-blue-500/[0.08] text-blue-500 shadow-blue-950/10 dark:text-blue-300',
  chapter: 'border-violet-500/30 bg-violet-500/[0.08] text-violet-500 shadow-violet-950/10 dark:text-violet-300',
  lesson: 'border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-600 shadow-cyan-950/10 dark:text-cyan-300',
  unit: 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-600 shadow-emerald-950/10 dark:text-emerald-300',
  component: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-600 shadow-amber-950/10 dark:text-amber-300',
} as const;

const pendingNodeAccent: Record<keyof typeof pendingNodeTone, string> = {
  course: '#3b82f6', chapter: '#8b5cf6', lesson: '#06b6d4', unit: '#10b981', component: '#f59e0b',
};

const pendingMindmapGeometry = {
  width: 1180,
  height: 560,
  nodeWidth: 244,
  nodeHeight: 118,
  nodes: [
    { id: 'course', kind: 'course', x: 48, y: 247 },
    { id: 'chapter-top', kind: 'chapter', x: 370, y: 112 },
    { id: 'chapter-bottom', kind: 'chapter', x: 370, y: 382 },
    { id: 'unit', kind: 'unit', x: 860, y: 74 },
    { id: 'lesson', kind: 'lesson', x: 860, y: 247 },
    { id: 'component', kind: 'component', x: 860, y: 420 },
  ],
} as const;

const pendingMindmapEdges = [
  { id: 'course-chapter-top', from: 'course', to: 'chapter-top' },
  { id: 'course-chapter-bottom', from: 'course', to: 'chapter-bottom' },
  { id: 'chapter-top-unit', from: 'chapter-top', to: 'unit' },
  { id: 'chapter-top-lesson', from: 'chapter-top', to: 'lesson' },
  { id: 'chapter-bottom-component', from: 'chapter-bottom', to: 'component' },
] as const;

function pendingMindmapEdgePath(fromId: string, toId: string) {
  const from = pendingMindmapGeometry.nodes.find(node => node.id === fromId)!;
  const to = pendingMindmapGeometry.nodes.find(node => node.id === toId)!;
  const startX = from.x + pendingMindmapGeometry.nodeWidth + 12;
  const startY = from.y + pendingMindmapGeometry.nodeHeight / 2;
  const endX = to.x - 16;
  const endY = to.y + pendingMindmapGeometry.nodeHeight / 2;
  if (startY === endY) return `M ${startX} ${startY} H ${endX}`;
  const middleX = Math.round(startX + (endX - startX) * 0.5);
  const directionY = endY > startY ? 1 : -1;
  const radius = Math.min(18, Math.abs(endY - startY) / 2, (endX - startX) / 4);
  return `M ${startX} ${startY} H ${middleX - radius} Q ${middleX} ${startY} ${middleX} ${startY + directionY * radius} V ${endY - directionY * radius} Q ${middleX} ${endY} ${middleX + radius} ${endY} H ${endX}`;
}

function PendingMindmapNode({ label, kind, x, y, delay = 0 }: {
  label: string; kind: keyof typeof pendingNodeTone; x: number; y: number; delay?: number;
}) {
  const { Icon } = getWorkspaceNodeVisual({ kind, component_type: null, media_type: null });
  return <motion.div initial={{ opacity: 0, scale: 0.96, x: -8 }} animate={{ opacity: 1, scale: 1, x: 0 }}
    transition={{ duration: 0.35, delay }}
    style={{ left: x, top: y, '--workspace-build-accent': pendingNodeAccent[kind] } as CSSProperties}
    data-workspace-building="true"
    className={`workspace-build-node absolute h-[118px] w-[244px] overflow-hidden rounded-2xl border bg-card/95 shadow-[0_18px_45px_-28px_currentColor] backdrop-blur-sm ${pendingNodeTone[kind]}`}>
    <div className="h-1 w-full bg-current opacity-80" />
    <div className="flex gap-3 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-background/75 shadow-sm"><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><span className="inline-flex rounded-full border border-current/20 bg-background/65 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em]">{label}</span>
          <WorkspaceBuildBeacon /></div>
        <div className="workspace-build-shimmer mt-3 space-y-2" aria-hidden><div className="h-3 w-11/12 rounded-full bg-current/[0.24] dark:bg-current/[0.17]" /><div className="h-3 w-7/12 rounded-full bg-current/[0.18] dark:bg-current/[0.12]" /></div>
      </div>
    </div>
  </motion.div>;
}

/** Product-shaped loading shell used before the first committed graph.
 * It deliberately renders no planning/provider data: content is shown only
 * after it belongs to the committed, interactive workspace graph. */
export function WorkspacePendingSkeleton({ locale, stage }: {
  locale: WorkspaceLocale; stage: 'overview' | 'mindmap';
}) {
  const c = workspaceCopy[locale];
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}
    className="h-full min-h-[320px] overflow-y-auto p-4 sm:p-5" role="status" aria-live="polite">
    <span className="sr-only">{stage === 'overview' ? c.emptyOverview : c.empty}</span>
    {stage === 'overview' ? <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{pendingOverviewMetrics(locale).map(item => { const Icon = item.icon; return <div key={item.label} className="workspace-build-card flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"
        style={{ '--workspace-build-accent': item.accent } as CSSProperties}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4.5 w-4.5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><div className="workspace-build-shimmer h-5 w-10 rounded bg-muted" aria-hidden /><p className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted-foreground">{item.label}</p></div>
      </div>; })}</div>
      <WorkspaceCourseOverviewSkeleton locale={locale} />
      <section className="workspace-build-card rounded-2xl border border-primary/20 bg-card p-4 shadow-sm"
        style={{ '--workspace-build-accent': '#3b82f6' } as CSSProperties}>
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><GitBranch className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{c.chapters}</p><div className="workspace-build-shimmer mt-2 h-4 w-48 max-w-[55vw] rounded bg-muted" aria-hidden /></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{[0, 1].map(index => <div key={index} className="rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">{c.chapter} {index + 1} · {c.outcomes}</p>
          <div className="workspace-build-shimmer mt-3 space-y-2" aria-hidden><div className="h-3 w-5/6 rounded bg-violet-500/15" /><div className="h-3 w-2/3 rounded bg-violet-500/10" /></div>
        </div>)}</div>
      </section>
    </div> : <div className="h-full w-full overflow-auto" aria-hidden>
      <div data-pending-mindmap-canvas className="relative mx-auto h-[560px] w-[1180px] overflow-hidden rounded-3xl border border-border/45 bg-background shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),0_24px_70px_-55px_hsl(var(--primary))]"
        style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground) / 0.2) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_45%,hsl(var(--primary)/0.08),transparent_38%),linear-gradient(to_bottom,hsl(var(--background)/0.2),hsl(var(--background)/0.78))]" />
        <div className="absolute left-1/2 top-5 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/20 bg-card/90 px-4 py-2 shadow-lg backdrop-blur-md">
          <WorkspaceBuildBeacon />
          <div><p className="text-xs font-semibold text-foreground">{c.buildingMap}</p><p className="text-[10px] text-muted-foreground">{c.buildingMapNote}</p></div>
        </div>
        {/* Cards and edges share one fixed logical coordinate system. Every
         * path terminates inside the canvas and immediately before its target,
         * so responsive scrolling cannot cut or detach an edge. */}
        <svg data-pending-edge-layer aria-hidden className="pointer-events-none absolute inset-0 h-full w-full text-primary"
          viewBox={`0 0 ${pendingMindmapGeometry.width} ${pendingMindmapGeometry.height}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="pending-map-edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="0.55" stopColor="currentColor" stopOpacity="0.68" />
              <stop offset="1" stopColor="#38bdf8" stopOpacity="0.92" />
            </linearGradient>
            <marker id="pending-map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
              <path d="M 1 1 L 9 5 L 1 9 z" fill="#38bdf8" opacity="0.9" />
            </marker>
          </defs>
          {pendingMindmapEdges.map((edge, index) => <g key={edge.id} data-pending-edge={edge.id}>
            <path data-pending-edge-track d={pendingMindmapEdgePath(edge.from, edge.to)} fill="none" stroke="url(#pending-map-edge-gradient)"
              vectorEffect="non-scaling-stroke" strokeWidth="7" strokeLinecap="round" opacity="0.12" />
            <path d={pendingMindmapEdgePath(edge.from, edge.to)} fill="none" stroke="url(#pending-map-edge-gradient)"
              vectorEffect="non-scaling-stroke" strokeWidth="2.25" strokeLinecap="round" markerEnd="url(#pending-map-arrow)" />
            <path data-pending-edge-flow d={pendingMindmapEdgePath(edge.from, edge.to)} fill="none" stroke="#38bdf8"
              vectorEffect="non-scaling-stroke" strokeWidth="2.75" strokeLinecap="round"
              className="workspace-build-edge-flow" style={{ animationDelay: `-${index * 0.14}s` }} />
          </g>)}
        </svg>
        {pendingMindmapGeometry.nodes.map((node, index) => <PendingMindmapNode key={node.id}
          label={c[node.kind]} kind={node.kind} x={node.x} y={node.y} delay={0.05 + index * 0.06} />)}
      </div>
    </div>}
  </motion.div>;
}

function terminalFailureText(status: WorkspaceStatus, locale: WorkspaceLocale): { stage: string | null; message: string; note: string | null } {
  const vi = locale === 'vi';
  const stageNames: Record<WorkspaceFailureStage, readonly [string, string]> = {
    source_snapshot: ['đọc tài liệu nguồn', 'reading source documents'],
    course_skeleton: ['tạo khung khóa học', 'creating the course outline'],
    chapter_blueprint: ['tạo nội dung chương', 'creating chapter content'],
    validate_architecture: ['kiểm tra cấu trúc khóa học', 'validating the course structure'],
    publish_inventory: ['ghi nhận cây nội dung', 'committing the content tree'],
    generate_unit: ['soạn nội dung bài học', 'writing lesson content'],
    validate_chapter: ['kiểm tra nội dung chương', 'validating chapter content'],
    finalize_course: ['hoàn tất khóa học', 'finalizing the course'],
  };
  const chapter = status.failure_chapter_key?.match(/^chapter-(\d+)$/)?.[1];
  const stage = status.failure_stage ? `${stageNames[status.failure_stage][vi ? 0 : 1]}${chapter ? ` (${vi ? 'Chương' : 'Chapter'} ${chapter})` : ''}` : null;
  if (status.failure_code === 'ASSESSMENT_REVIEW_REQUIRED') return {
    stage: vi ? 'kiểm tra chất lượng đánh giá' : 'reviewing assessment quality',
    message: vi
      ? 'Nội dung bài học đã được tạo và lưu. Một số câu hỏi đánh giá cần được rà soát lại theo tài liệu nguồn trước khi khóa học được xác nhận hoàn tất.'
      : 'Lesson content was created and saved. Some assessment questions require source review before the course can be finalized.',
    note: vi
      ? 'Bạn vẫn có thể xem và áp dụng các nội dung đã sẵn sàng trong bản thiết kế khoá học.'
      : 'You can still review and apply the content that is ready in the course design.',
  };
  if (status.failure_code === 'ORCHESTRATION_V2_EXECUTION_RUNTIME_CHANGED') return {
    stage, message: vi ? 'Cấu hình AI của doanh nghiệp đã thay đổi trong lúc tạo nội dung.' : 'The organization AI configuration changed while content was being created.',
    note: vi ? 'Yêu cầu của bước này chưa được gửi đến AI và không phát sinh lượt gọi cho lần thử đó.' : 'This step was not sent to the AI provider, so that attempt did not create a provider call.',
  };
  if (status.failure_code === 'AI_PROVIDER_AUTH_REJECTED') return {
    stage, message: vi ? 'Nhà cung cấp AI từ chối thông tin xác thực. Hãy kiểm tra API key của doanh nghiệp.' : 'The AI provider rejected the credentials. Check the organization API key.', note: null,
  };
  if (status.failure_code === 'AI_PROVIDER_QUOTA_EXHAUSTED') return {
    stage, message: vi ? 'API key đã hết hạn mức/tiền — vui lòng nạp thêm hoặc đổi key.' : 'The AI provider key has run out of quota or credit. Top it up or change the key.',
    note: vi ? 'Hệ thống đã dừng thay vì tạo nội dung dự phòng cho các bước còn lại.' : 'The run stopped instead of filling the remaining steps with fallback content.',
  };
  if (status.failure_code === 'AI_PROVIDER_RATE_LIMITED') return {
    stage, message: vi ? 'Nhà cung cấp AI đang giới hạn tần suất gọi của API key này. Vui lòng thử lại sau ít phút hoặc nâng hạn mức.' : 'The AI provider is rate limiting this API key. Try again in a few minutes or raise the rate limit.',
    note: null,
  };
  if (status.failure_code === 'IDM_UNITS_MOSTLY_FALLBACK') return {
    stage, message: vi ? 'Phần lớn bài học là bản dự phòng dựng từ tài liệu nguồn, chưa được AI soạn. Cần biên tập trước khi dùng hoặc tạo lại khi AI sẵn sàng.' : 'Most lessons are fallback drafts rebuilt from the source, not written by the AI. Edit them before use or regenerate when the AI is available.',
    note: vi ? 'Bạn vẫn có thể xem, sửa và áp dụng các nội dung đã tạo.' : 'You can still review, edit and apply the generated content.',
  };
  if (status.failure_code === 'PROVIDER_OUTCOME_UNKNOWN') return {
    stage, message: vi ? 'Yêu cầu đã được gửi đến AI nhưng hệ thống chưa xác nhận được kết quả.' : 'The request reached the AI provider, but its result could not be confirmed.',
    note: vi ? 'Hệ thống không tự gọi lại mù quáng để tránh tạo nội dung hoặc chi phí trùng.' : 'The system did not blindly replay the request, preventing duplicate content or charges.',
  };
  if (status.failure_stage === 'finalize_course' && status.unit_count > 0 && status.ready_unit_count === status.unit_count) return {
    stage,
    message: vi ? 'Nội dung bài học đã được tạo và lưu. Hệ thống chưa hoàn tất bước kiểm tra cuối.' : 'Lesson content was created and saved, but the final check did not complete.',
    note: vi ? 'Bạn vẫn có thể xem bản thiết kế khoá học. Hãy tải lại trạng thái trước khi thử thao tác tiếp theo.' : 'You can still review the draft. Reload its saved state before the next action.',
  };
  return { stage,
    message: vi ? 'Hệ thống không thể hoàn tất bước này sau các lần thử an toàn.' : 'The system could not complete this step after its safe attempts.',
    note: status.failure_code ? (vi ? 'Các phần đã ghi nhận trước đó vẫn được giữ nguyên.' : 'Previously committed sections remain available.') : null };
}

function WorkspaceTerminalPanel({ locale, status, onRefresh, compact = false }: { locale: WorkspaceLocale; status: WorkspaceStatus; onRefresh?: () => void; compact?: boolean }) {
  const c = workspaceCopy[locale];
  const message = status.status === 'needs_action' ? c.terminalNeedsAction : status.status === 'failed' ? c.terminalFailed
    : status.status === 'canceled' ? c.terminalCanceled : c.terminalReady;
  const failure = terminalFailureText(status, locale);
  const isFailure = status.status === 'needs_action' || status.status === 'failed';
  const contentCommitted = status.failure_stage === 'finalize_course' && status.unit_count > 0 && status.ready_unit_count === status.unit_count;
  const assessmentReviewRequired = status.failure_code === 'ASSESSMENT_REVIEW_REQUIRED';
  return <div className={`${compact ? 'mx-4 my-3 sm:mx-5' : 'm-4 max-w-2xl'} flex flex-col gap-3 rounded-2xl border p-4 text-sm ${isFailure && !contentCommitted ? 'border-destructive/35 bg-destructive/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'}`} role={isFailure && !contentCommitted ? 'alert' : 'status'} aria-live="polite">
    <div className="flex items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isFailure && !contentCommitted ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}><AlertTriangle className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0"><p className="font-semibold">{c[status.status]}</p><p className="mt-1 leading-6 text-muted-foreground">{isFailure && status.failure_code ? failure.message : message}</p>
        {failure.stage && <p className="mt-1 text-xs font-medium text-foreground">{locale === 'vi' ? 'Bước gặp lỗi' : 'Failed step'}: {failure.stage}</p>}
        {failure.note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{failure.note}</p>}
      </div></div>
    {(!assessmentReviewRequired && (onRefresh || isFailure)) && <div className="flex flex-wrap items-center gap-2">
      {onRefresh && <Button type="button" variant="outline" size="sm" onClick={onRefresh}>{c.terminalReload}</Button>}
      {isFailure && <p className="text-xs text-muted-foreground">{locale === 'vi' ? 'Sau khi xử lý nguyên nhân, đóng cửa sổ và chọn Tạo nội dung bài học để tạo một bản thiết kế khoá học mới.' : 'After resolving the cause, close this window and choose Create lesson content to start a new draft.'}</p>}
    </div>}
  </div>;
}

export function WorkspacePlanningOverview({ preview, locale }: {
  preview: WorkspaceArchitecturePreview;
  locale: WorkspaceLocale;
}) {
  const c = workspaceCopy[locale];
  const count = (kind: WorkspaceNode['kind']) => preview.nodes.filter(node => node.kind === kind).length;
  const metrics = [
    { label: c.chapterCount, value: preview.total_chapters || '—', icon: GitBranch, accent: '#3b82f6', tone: 'text-primary bg-primary/10 border-primary/20' },
    { label: c.sectionCount, value: count('lesson'), icon: ListTree, accent: '#8b5cf6', tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20 dark:text-violet-300' },
    { label: c.lessonCount, value: count('unit'), icon: BookOpenCheck, accent: '#10b981', tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300' },
    { label: c.interactiveCount, value: count('component'), icon: Blocks, accent: '#f59e0b', tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300' },
  ] as const;
  const stateLabel = (state: WorkspaceArchitecturePreviewState) => state === 'ready'
    ? (locale === 'vi' ? 'Đã tạo cấu trúc' : 'Structure ready')
    : state === 'needs_action' ? (locale === 'vi' ? 'Cần kiểm tra' : 'Needs review')
      : state === 'generating' ? c.generating : c.planned;
  return <div className="mx-auto max-w-5xl px-4 py-5 sm:px-5 sm:py-6" role="status" aria-live="polite">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(item => { const Icon = item.icon; return <div key={item.label} className="workspace-build-card flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"
      style={{ '--workspace-build-accent': item.accent } as CSSProperties}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4.5 w-4.5" aria-hidden /></span>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="workspace-build-value text-lg font-bold tabular-nums text-foreground">{item.value}</p><WorkspaceBuildBeacon /></div>
        <p className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted-foreground">{item.label}</p></div>
    </div>; })}</div>
    <section className="workspace-build-card mt-4 overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm"
      style={{ '--workspace-build-accent': '#3b82f6' } as CSSProperties}>
      <div className="flex items-start gap-3 border-b border-border/60 bg-primary/[0.04] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Network className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{c.course}</p>
          <p className="mt-1 truncate font-semibold text-foreground" title={preview.course_title}>{preview.course_title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><WorkspaceBuildBeacon />
            {locale === 'vi' ? 'Nội dung đang được tạo và sẽ xuất hiện ngay khi sẵn sàng.' : 'Content is being created and will appear as soon as it is ready.'}</p>
        </div>
      </div>
      {preview.chapters.length > 0 ? <div className="grid gap-3 p-4 md:grid-cols-2">{preview.chapters.map(chapter => <article key={chapter.chapter_key}
        className={`${chapter.state !== 'needs_action' ? 'workspace-build-card' : ''} rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5`}
        style={{ '--workspace-build-accent': '#8b5cf6' } as CSSProperties}>
          <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-semibold text-foreground">{chapter.title}</p>
            <Badge variant="outline" className="h-5 shrink-0 gap-1 rounded-full border-violet-500/25 px-2 text-[10px] text-violet-600 dark:text-violet-300">
            {chapter.state !== 'needs_action' && <WorkspaceBuildBeacon />}{stateLabel(chapter.state)}
          </Badge></div>
      </article>)}</div> : <div className="p-4"><div className="workspace-build-shimmer h-3 w-2/3 rounded bg-muted" aria-hidden /><div className="workspace-build-shimmer mt-2 h-3 w-1/2 rounded bg-muted/70" aria-hidden /></div>}
    </section>
  </div>;
}

function Overview({ graph, preview, details, locale, loading, terminal, onRefresh }: { graph: WorkspaceGraph | null;
  preview: WorkspaceArchitecturePreview | null;
  details: readonly WorkspaceTypedDetail[]; locale: WorkspaceLocale; loading: boolean;
  terminal: WorkspaceStatus | null; onRefresh?: () => void }) {
  const c = workspaceCopy[locale];
  if (!graph?.overview_ready) return preview ? <WorkspacePlanningOverview preview={preview} locale={locale} />
    : loading ? <WorkspacePendingSkeleton locale={locale} stage="overview" />
    : terminal ? <WorkspaceTerminalPanel locale={locale} status={terminal} onRefresh={onRefresh} /> : <p className="p-4" role="status">{c.emptyOverview}</p>;
  const course = graph.nodes.find(n => n.kind === 'course');
  const chapters = graph.nodes.filter(n => n.kind === 'chapter').sort((a, b) => a.sort_order - b.sort_order);
  const counts = workspaceOverviewCounts(graph);
  const detailFor = (node: WorkspaceNode) => details.find(d => d.workspace_id === graph.workspace_id && d.correlation_id === graph.correlation_id
    && d.content_locale === graph.content_locale && workspaceDetailMatches(node, d));
  const courseDetail = course ? detailFor(course) : undefined;
  function outcomes(node: WorkspaceNode): string[] | null {
    const detail = detailFor(node);
    const data = detail?.content?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const value = data.learning_outcomes ?? data.learning_objectives;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim())
      .map(workspaceLearningOutcomeLabel).slice(0, 24) : [];
  }
  return <div className="mx-auto max-w-5xl px-4 py-5 sm:px-5 sm:py-6">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: c.chapterCount, value: counts.chapters, icon: GitBranch, tone: 'text-primary bg-primary/10 border-primary/20' },
        { label: c.sectionCount, value: counts.sections, icon: ListTree, tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20 dark:text-violet-300' },
        { label: c.lessonCount, value: counts.lessons, icon: BookOpenCheck, tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300' },
        { label: c.interactiveCount, value: counts.interactive, icon: Blocks, tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300' },
      ].map(item => { const Icon = item.icon; return <div key={item.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4.5 w-4.5" aria-hidden /></span>
        <div className="min-w-0"><p className="text-xl font-bold tabular-nums leading-none">{item.value}</p><p className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted-foreground">{item.label}</p></div>
      </div>; })}
    </div>
    {course && <div className="mt-4">
      {courseDetail ? <WorkspaceAggregateContent detail={courseDetail} locale={locale} />
        : <WorkspaceCourseOverviewSkeleton locale={locale} />}
    </div>}
    <div className="relative mt-5">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.09] to-card p-4 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><GitBranch className="h-5 w-5" /></span>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{c.chapters}</p>
          <h2 className="break-words text-base font-semibold">{course?.title ?? c.course}</h2></div>
      </div>
      <div className="relative ml-9 border-l-2 border-primary/35 pb-2 pl-7 pt-4">
        {chapters.map((node, index) => { const values = outcomes(node); return <section key={node.node_id} className="relative mb-4 last:mb-0">
        <span className="absolute -left-[1.82rem] top-7 h-0.5 w-7 bg-primary/35" aria-hidden />
        <span className="absolute -left-[2.25rem] top-[1.35rem] flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary/50 bg-background" aria-hidden><span className="h-1.5 w-1.5 rounded-full bg-primary" /></span>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.55)] sm:p-5">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpenCheck className="h-4 w-4" /></span>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{c.chapter} {index + 1}</p><h3 className="mt-1 break-words text-sm font-semibold leading-5">{node.title ?? c.chapter}</h3></div></div>
          {values === null ? <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5" aria-label={c.loading} role="status"><p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300"><BookOpenCheck className="h-3.5 w-3.5" aria-hidden />{c.outcomes}</p><div className="animate-pulse space-y-2" aria-hidden><div className="h-3 w-5/6 rounded bg-violet-500/10" /><div className="h-3 w-2/3 rounded bg-violet-500/10" /></div></div>
            : values.length ? <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">{c.outcomes}</p><ul className="space-y-2">{values.map((value, valueIndex) => <li key={valueIndex} className="flex gap-2 text-sm leading-5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" /><span className="min-w-0 break-words">{value}</span></li>)}</ul></div>
              : <p className="mt-4 rounded-xl border border-border/60 bg-muted/25 p-3 text-sm text-muted-foreground">{c.notAvailable}</p>}
        </div>
        </section>; })}
      </div>
    </div>
  </div>;
}

/** Presentation only: no host entrypoint, effects, timers, writes, or provider
 * calls. Host owns store open/close/visibility/dispose on actor/scope changes. */
export function WorkspaceDialog(props: WorkspaceDialogProps) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent showCloseButton={false}
      overlayClassName="z-[10040]"
      className="z-[10050] flex h-[100dvh] w-screen max-h-none max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-2xl">
      <WorkspaceDialogBody {...props} />
    </DialogContent>
  </Dialog>;
}

/** Body deliberately has no Dialog/Portal boundary. The host keeps one modal
 * mounted from source selection through workspace delivery, so a status/graph
 * update cannot recreate focus, scroll lock, entry animation, or viewport. */
export function WorkspaceDialogBody({ open, onOpenChange, state, locale, onSelectNode, overviewDetails = [], toolbar, renderNodeDetail, assistantAvatarSrc, draftTitle, onRefresh }: WorkspaceDialogProps) {
  const c = workspaceCopy[locale];
  const [tab, setTab] = useState('overview');
  const [expansion, setExpansion] = useState<Expansion>({});
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [fitRequest, setFitRequest] = useState(0);
  const initialGraph = state.opened && state.access === 'allowed' ? state.graph : null;
  const [revealedNodeIds, setRevealedNodeIds] = useState<ReadonlySet<string>>(
    () => new Set(initialGraph?.nodes.map(node => node.node_id) ?? []));
  const revealedNodeIdsRef = useRef(new Set(revealedNodeIds));
  const availableNodeIdsRef = useRef(new Set(revealedNodeIds));
  const revealQueue = useRef<string[]>([]);
  const revealTimer = useRef<number | null>(null);
  const revealWorkspace = useRef<string | null>(initialGraph?.workspace_id ?? null);
  const initializedExpansionWorkspace = useRef<string | null>(null);
  const dragGuard = useRef({ dragging: false, lastDragEndedAt: 0 });
  const fitFlow = useRef<(() => void) | null>(null);
  const fittedWorkspace = useRef<string | null>(null);
  const viewportByWorkspace = useRef(new Map<string, Viewport>());
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const canRead = state.opened && state.access === 'allowed';
  const graph = canRead ? state.graph : null;
  const preview = canRead ? state.status?.architecture_preview ?? null : null;
  const workspaceId = graph?.workspace_id ?? (canRead ? state.status?.workspace_id ?? null : null);
  const presentationNodes = useMemo(() => workspacePresentationNodes(graph, preview), [graph, preview]);
  const onExpand = useCallback((id: string, expanded: boolean) => {
    // A manual drag is browser-local. Once topology changes, the deterministic
    // tree layout must become authoritative again or newly revealed nodes can overlap it.
    setNodePositions({});
    setExpansion(prev => expanded ? { ...prev, [id]: true } : collapsePresentationBranch(presentationNodes, prev, id));
  }, [presentationNodes]);
  const runActive = state.status?.status === 'queued' || state.status?.status === 'designing' || state.status?.status === 'drafting';
  const terminal = state.status && ['ready', 'needs_action', 'failed', 'canceled'].includes(state.status.status)
    ? state.status : null;
  const runEnded = workspaceRunEnded(state.status?.status);
  const overviewLoading = canRead && runActive && !graph?.overview_ready;
  // Skeletons describe absence, never partially committed course data. As soon
  // as one complete graph snapshot contains nodes, render the real interactive
  // graph even while later branches are still being generated.
  const mindmapLoading = canRead && runActive
    && presentationNodes.length === 0;
  useEffect(() => { setNodePositions({}); }, [workspaceId]);
  useEffect(() => {
    const initial = initialWorkspaceExpansion(graph, state.status);
    if (!graph || initial === null || initializedExpansionWorkspace.current === graph.workspace_id) return;
    initializedExpansionWorkspace.current = graph.workspace_id;
    setExpansion(initial);
    setNodePositions({});
  }, [graph, state.status]);
  useEffect(() => {
    if (!graph && !preview) {
      revealWorkspace.current = null; revealQueue.current = []; revealedNodeIdsRef.current = new Set();
      availableNodeIdsRef.current = new Set();
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      revealTimer.current = null; setRevealedNodeIds(new Set()); return;
    }
    const ordered = projectWorkspaceLiveGraph(graph, preview, {}).map(item => item.node.node_id);
    const available = new Set(ordered);
    availableNodeIdsRef.current = available;
    const newWorkspace = revealWorkspace.current !== workspaceId;
    if (newWorkspace) {
      revealWorkspace.current = workspaceId; revealQueue.current = [];
      revealedNodeIdsRef.current = new Set(); setRevealedNodeIds(new Set());
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      revealTimer.current = null;
    } else {
      const retained = new Set([...revealedNodeIdsRef.current].filter(id => available.has(id)));
      if (retained.size !== revealedNodeIdsRef.current.size) {
        revealedNodeIdsRef.current = retained; setRevealedNodeIds(new Set(retained));
      }
      revealQueue.current = revealQueue.current.filter(id => available.has(id));
    }
    // Durable preview updates are already paced by orchestration events. Paint
    // each acknowledged topology snapshot immediately instead of adding a
    // second client-side queue that would make a large course feel stalled.
    if (preview || !runActive) {
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      revealTimer.current = null; revealQueue.current = [];
      revealedNodeIdsRef.current = new Set(ordered); setRevealedNodeIds(new Set(ordered)); return;
    }
    if (newWorkspace && ordered.length) {
      revealedNodeIdsRef.current = new Set([ordered[0]!]); setRevealedNodeIds(new Set([ordered[0]!]));
    }
    revealQueue.current.push(...workspaceProgressiveRevealQueue(graph, revealedNodeIdsRef.current, revealQueue.current));
    const drain = () => {
      if (revealTimer.current !== null || !revealQueue.current.length) return;
      // Normal courses reveal one node per frame. Very large committed graphs
      // use bounded batches so presentation never takes minutes or allocates a
      // timer per node; ordering is still deterministic within each batch.
      const batchSize = Math.max(1, Math.ceil(revealQueue.current.length / 40));
      const delay = revealQueue.current.length > 40 ? 50 : 90;
      revealTimer.current = window.setTimeout(() => {
        revealTimer.current = null;
        const next = new Set(revealedNodeIdsRef.current);
        for (const nodeId of revealQueue.current.splice(0, batchSize)) {
          if (availableNodeIdsRef.current.has(nodeId)) next.add(nodeId);
        }
        revealedNodeIdsRef.current = next; setRevealedNodeIds(next);
        drain();
      }, delay);
    };
    drain();
  }, [graph, preview, runActive, workspaceId]);
  useEffect(() => () => { if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); }, []);
  const projection = useMemo(() => projectWorkspaceLiveGraph(graph, preview, expansion)
    .filter(item => item.preview || revealedNodeIds.has(item.node.node_id)), [graph, preview, expansion, revealedNodeIds]);
  const expandableNodeIds = useMemo(() => {
    const parents = new Set(presentationNodes.map(item => item.node.parent_id).filter((value): value is string => value !== null));
    return presentationNodes.filter(item => parents.has(item.node.node_id)).map(item => item.node.node_id);
  }, [presentationNodes]);
  const allExpanded = expandableNodeIds.length > 0 && expandableNodeIds.every(id => {
    return expansion[id] ?? true;
  });
  const toggleAllNodes = useCallback(() => {
    setNodePositions({});
    if (allExpanded) setExpansion(collapsePresentationToChapterLevel(presentationNodes));
    else setExpansion(Object.fromEntries(expandableNodeIds.map(id => [id, true])));
    setFitRequest(value => value + 1);
  }, [allExpanded, expandableNodeIds, presentationNodes]);
  const nodes = useMemo<FlowNode[]>(() => projection.map(p => ({ id: p.node.node_id, type: 'workspace', position: nodePositions[p.node.node_id] ?? p.position,
    data: { ...p, locale, onExpand, runEnded }, draggable: !p.preview, connectable: false, selectable: !p.preview,
    ariaLabel: p.preview ? `${p.node.title ?? c[p.node.kind]}: ${locale === 'vi' ? 'đang tạo' : 'generating'}` : `${c.inspect}: ${p.node.title ?? c[p.node.kind]}`,
  })), [projection, locale, nodePositions, onExpand, c, runEnded]);
  const edges = useMemo<WorkspaceBuildEdge[]>(() => {
    const visible = new Set(nodes.map(n => n.id));
    const building = new Set(workspaceBuildingNodeIds(projection, undefined, runEnded));
    let animatedIndex = 0;
    return nodes.flatMap(n => n.data.node.parent_id && visible.has(n.data.node.parent_id)
      ? (() => {
        const active = building.has(n.id);
        const color = active ? workspaceBuildAccent(n.data.node) : edgeColor[workspaceMindmapStatus(n.data.node)];
        const delaySeconds = active ? (animatedIndex++ % maxAnimatedWorkspaceEdges) * 0.14 : 0;
        return [{ id: `edge:${n.id}`, source: n.data.node.parent_id, target: n.id, sourceHandle: 'right', targetHandle: 'left', type: 'workspaceBuild', selectable: false,
          animated: false, data: { active, color, delaySeconds },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
          style: { stroke: color, strokeWidth: workspaceMindmapStatus(n.data.node) === 'applied' ? 1.6 : active ? 2.5 : 2 } } satisfies WorkspaceBuildEdge];
      })() : []);
  }, [nodes, projection, runEnded]);
  /** Keep the same controlled Flow lifecycle as the established Blueprint map:
   * React Flow owns the in-progress drag, while the browser-local cache makes
   * its final position survive a realtime graph repaint. */
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<WorkspaceBuildEdge>(edges);
  useEffect(() => { setFlowNodes(nodes); }, [nodes, setFlowNodes]);
  useEffect(() => { setFlowEdges(edges); }, [edges, setFlowEdges]);
  useEffect(() => {
    // Individual branch expansion preserves the author's current camera.
    // Only the explicit all-tree action requests a new viewport fit.
    if (fitRequest === 0) return;
    const frame = window.requestAnimationFrame(() => fitFlow.current?.());
    return () => window.cancelAnimationFrame(frame);
  }, [fitRequest]);
  const onNodeDragStart = useCallback(() => { dragGuard.current.dragging = true; }, []);
  const onNodeDragStop = useCallback((_event: ReactMouseEvent, node: FlowNode) => {
    dragGuard.current.dragging = false; dragGuard.current.lastDragEndedAt = Date.now();
    setNodePositions(previous => ({ ...previous, [node.id]: node.position }));
  }, []);
  const onNodeClick = useCallback((_event: ReactMouseEvent, node: FlowNode) => {
    if (node.data.preview || dragGuard.current.dragging || Date.now() - dragGuard.current.lastDragEndedAt < 180) return;
    onSelectNode(node.id);
  }, [onSelectNode]);
  const rememberViewport = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    if (workspaceId) viewportByWorkspace.current.set(workspaceId, viewport);
  }, [workspaceId]);
  const initializeFlow = useCallback((instance: ReactFlowInstance<FlowNode, WorkspaceBuildEdge>) => {
    fitFlow.current = () => { void instance.fitView({ padding: 0.22, duration: 450 }); };
    if (!workspaceId) return;
    const remembered = viewportByWorkspace.current.get(workspaceId);
    if (remembered) {
      void instance.setViewport(remembered, { duration: 0 });
      return;
    }
    if (fittedWorkspace.current !== workspaceId) {
      fittedWorkspace.current = workspaceId;
      void instance.fitView({ padding: 0.22, duration: 0 });
    }
  }, [workspaceId]);
  const selected = graph?.nodes.find(n => n.node_id === state.selectedNodeId) ?? null;
  const detail = state.detail && graph && state.detail.workspace_id === graph.workspace_id
    && state.detail.correlation_id === graph.correlation_id && state.detail.content_locale === graph.content_locale ? state.detail : null;
  const details = useMemo(() => [...overviewDetails, ...(!state.detailStale && detail ? [detail] : [])], [overviewDetails, detail, state.detailStale]);
  const visibleReadError = state.error?.code === 'WORKSPACE_EVENT_RESNAPSHOT_REQUIRED' ? null : state.error;
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <span className="sr-only" ref={node => { if (node && !returnFocus.current) { returnFocus.current = document.activeElement as HTMLElement; } }} />
      <header className="flex shrink-0 items-start justify-between gap-3 border-b bg-card px-4 py-3 pr-4 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <WorkspaceAiAvatar src={assistantAvatarSrc} compact />
          <div className="min-w-0"><DialogTitle className="truncate text-base font-semibold">{draftTitle?.trim() || c.title}</DialogTitle><DialogDescription className="mt-1 line-clamp-2">{c.review}</DialogDescription></div>
        </div>
        <DialogClose asChild><Button ref={closeButton} variant="outline" size="sm">{c.close}</Button></DialogClose>
      </header>
      {visibleReadError && <p role="alert" className="mx-4 mt-3 shrink-0 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm sm:mx-5">{workspaceReadMessage(visibleReadError.code, locale)}</p>}
      {/* A committed graph is the user's actionable state. Terminal workflow
       * diagnostics stay in telemetry; a reload button cannot repair them and
       * must not displace or discredit already saved course-design content. */}
      {toolbar && <div className="max-h-[25dvh] shrink-0 overflow-y-auto border-b bg-background px-4 py-2 sm:px-5">{toolbar}</div>}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b bg-muted/10 px-3 py-2 sm:px-5">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/35 p-1 dark:bg-muted/20">
            <TabsTrigger value="overview" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm"><Target className="h-3.5 w-3.5" />{c.overview}</TabsTrigger>
            <TabsTrigger value="mindmap" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm"><MapIcon className="h-3.5 w-3.5" />{c.mindmap}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {canRead ? <Overview graph={graph} preview={preview} details={details} locale={locale} loading={overviewLoading} terminal={terminal} onRefresh={onRefresh} /> : <p className="p-4">{state.access === 'blocked' ? c.unavailable : c.unknown}</p>}
        </TabsContent>
        <TabsContent value="mindmap" className="relative mt-0 min-h-0 flex-1 overflow-hidden bg-background">
          {nodes.length > 0 ? <div className="h-full w-full min-h-0"><ReactFlowProvider><ReactFlow<FlowNode, WorkspaceBuildEdge> nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick} onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop}
            onInit={initializeFlow} onMoveEnd={rememberViewport}
            defaultViewport={workspaceId ? viewportByWorkspace.current.get(workspaceId) : undefined}
            minZoom={0.25} maxZoom={1.6}
            nodesDraggable nodesConnectable={false} edgesReconnectable={false} elementsSelectable deleteKeyCode={null}
            proOptions={{ hideAttribution: true }} className="bg-background" style={{ backgroundColor: 'hsl(var(--background))' }}
            ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': c.zoomIn, 'controls.zoomOut.ariaLabel': c.zoomOut, 'controls.fitView.ariaLabel': c.fit }}>
            <Panel position="top-right" className="!m-3 flex items-start gap-2">
              <div className="group relative nodrag nopan">
                <button type="button" aria-label={c.colorGuide}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/60 bg-amber-50 text-amber-700 shadow-lg transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-500/50 dark:bg-amber-950/80 dark:text-amber-300 dark:hover:bg-amber-950">
                  <Info className="h-4 w-4" aria-hidden />
                </button>
                <div role="tooltip" className="pointer-events-none absolute right-0 top-11 z-20 w-72 translate-y-1 rounded-xl border border-border bg-popover p-3 text-popover-foreground opacity-0 shadow-2xl transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                  <p className="text-xs font-semibold">{c.colorGuide}</p>
                  <div className="mt-2.5 space-y-2 text-[11px] leading-4 text-muted-foreground">
                    <p className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" />{c.legendPending}</p>
                    <p className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />{c.legendEdited}</p>
                    <p className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />{c.legendApplied}</p>
                    <p className="flex gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />{c.legendProposal}</p>
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="nodrag nopan h-9 gap-2 bg-card shadow-lg" onClick={toggleAllNodes}>
                <Rows3 className="h-4 w-4" aria-hidden />{allExpanded ? c.collapseAll : c.expandAll}
              </Button>
            </Panel>
            {runActive && state.status && state.status.unit_count > 0 && <Panel position="top-left" className="!m-3">
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur" role="status" aria-live="polite">
                <WorkspaceBuildBeacon />
                <span className="font-medium">{c.liveUnits}</span>
                <span className="tabular-nums text-muted-foreground">{state.status.ready_unit_count}/{state.status.unit_count}</span>
              </div>
            </Panel>}
            <Controls showInteractive={false} className="!bottom-3 !left-3 !overflow-hidden !rounded-lg !border !border-border !bg-card !shadow-lg [&>button]:!flex [&>button]:!h-9 [&>button]:!w-9 [&>button]:!items-center [&>button]:!justify-center [&>button]:!border-b [&>button]:!border-border/70 [&>button]:!bg-card [&>button]:!text-foreground [&>button:hover]:!bg-muted [&>button:last-child]:!border-b-0 [&>button>svg]:!fill-current [&>button>svg]:!stroke-current [&>button>svg]:!text-foreground" />
            <MiniMap pannable zoomable className="!border !border-border !bg-card !shadow-lg" nodeStrokeWidth={3}
              nodeColor={item => { const data = item.data as FlowData | undefined; return edgeColor[workspaceMindmapStatus(data?.node ?? { kind: 'course', applied: false, user_modified: false })]; }} />
            <Background gap={18} size={1} color="hsl(var(--muted-foreground) / 0.18)" />
          </ReactFlow></ReactFlowProvider></div> : mindmapLoading ? <WorkspacePendingSkeleton locale={locale} stage="mindmap" /> : terminal ? <WorkspaceTerminalPanel locale={locale} status={terminal} onRefresh={onRefresh} />
            : <p className="p-4" role="status">{state.access === 'blocked' ? c.unavailable : c.empty}</p>}
        </TabsContent>
      </Tabs>
      <footer className="shrink-0 border-t bg-card px-4 py-2 text-xs text-muted-foreground sm:px-5">{c.available}</footer>
      {renderNodeDetail ? renderNodeDetail(open ? selected : null) : <WorkspaceNodeDetail node={open ? selected : null} detail={detail} locale={locale} stale={state.detailStale} runEnded={runEnded}
        onClose={() => onSelectNode(null)} />}
  </div>;
}
