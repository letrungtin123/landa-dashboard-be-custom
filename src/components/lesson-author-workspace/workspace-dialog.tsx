import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Background, Controls, Handle, MarkerType, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, type Edge, type Node, type NodeProps, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Blocks, BookOpenCheck, CheckCircle2, ChevronDown, ChevronRight, CircleDot, FileText, GitBranch, HelpCircle, Image as ImageIcon, Info, ListTree, Map as MapIcon, Network, RefreshCw, Rows3, Target } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { workspaceReadMessage, type WorkspaceFailureStage, type WorkspaceGraph, type WorkspaceLocale, type WorkspaceNode, type WorkspaceStatus } from '../../api/lesson-author-workspace.contract';
import type { WorkspaceReadState } from './workspace-read-state';
import { WorkspaceAggregateContent, WorkspaceCourseOverviewSkeleton, WorkspaceNodeDetail, workspaceCopy, workspaceDetailMatches, workspaceLearningOutcomeLabel, type WorkspaceTypedDetail } from './workspace-node-detail';
import { WorkspaceAiAvatar } from './workspace-ai-avatar';

type Expansion = Readonly<Record<string, boolean>>;
export interface WorkspaceProjectionNode { node: WorkspaceNode; position: { x: number; y: number }; childCount: number; expanded: boolean }

/** Committed graph only. Stable server identity/order, never title matching or
 * planned/generated payload synthesis. Prune hidden descendants before Flow. */
export function projectWorkspaceGraph(graph: WorkspaceGraph | null, expansion: Expansion = {}): WorkspaceProjectionNode[] {
  if (!graph?.structure_ready || graph.has_more || graph.nodes.length !== graph.total_nodes) return [];
  const children = new Map<string | null, WorkspaceNode[]>();
  for (const node of graph.nodes) {
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node); children.set(node.parent_id, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => {
    // Media recommendations are presented first inside a lesson without
    // changing server canonical order/hashes used by Save, Reset and Apply.
    const mediaRank = (node: WorkspaceNode) => node.kind === 'media_brief' ? 0 : 1;
    return mediaRank(a) - mediaRank(b) || a.sort_order - b.sort_order || a.node_id.localeCompare(b.node_id);
  });
  const output: WorkspaceProjectionNode[] = [];
  const seen = new Set<string>();
  let leafIndex = 0;
  // Cards can grow to ~130px once status and child metadata are present. Keep
  // the layout gap larger than the rendered card, not the old compact card.
  const depthGap = 330, rowGap = 180;
  function visit(node: WorkspaceNode, depth: number): number | null {
    if (seen.has(node.node_id)) return null;
    seen.add(node.node_id);
    const descendants = children.get(node.node_id) ?? [];
    // The read API reveals complete unit subtrees only after their atomic
    // unit_ready commit. Keep every available branch open by default so each
    // newly committed unit is actually visible in realtime instead of being
    // hidden beneath a collapsed chapter. Explicit user collapse still wins.
    const expanded = expansion[node.node_id] ?? true;
    const projected: WorkspaceProjectionNode = { node, position: { x: 0, y: 0 }, childCount: descendants.length, expanded };
    output.push(projected);
    const childYs = expanded ? descendants.map(child => visit(child, depth + 1)).filter((value): value is number => value !== null) : [];
    const y = childYs.length ? (Math.min(...childYs) + Math.max(...childYs)) / 2 : leafIndex++ * rowGap;
    projected.position = { x: depth * depthGap + 40, y: y + 40 };
    return y;
  }
  for (const root of children.get(null) ?? []) visit(root, 0);
  return output;
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

/** Choose the initial tree mode once per modal open. Active runs stay open so
 * committed units appear live; reopening a terminal run starts at the useful
 * course + chapter index instead of rendering the complete tree at once. */
export function initialWorkspaceExpansion(graph: WorkspaceGraph | null, status: WorkspaceStatus | null): Expansion | null {
  if (!graph?.structure_ready || !status) return null;
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
};
type FlowNode = Node<FlowData, 'workspace'>;

/** Mirrors the established Blueprint mindmap visual contract on `main`.
 * Workspace state is deliberately mapped only for presentation; it never
 * changes the server-owned workspace state machine. */
type WorkspaceMindmapStatus = 'applied' | 'pending' | 'edited' | 'proposal';

const statusClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'border-slate-300/60 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
  pending: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
  edited: 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200',
  proposal: 'border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-500/70 dark:bg-sky-950/45 dark:text-sky-200',
};

const nodeShellClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'border-slate-300 bg-slate-50 text-slate-950 shadow-slate-950/5 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-50',
  pending: 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-emerald-950/5 dark:border-emerald-700 dark:bg-emerald-950/55 dark:text-emerald-50',
  edited: 'border-yellow-500 bg-yellow-50 text-yellow-950 shadow-yellow-950/5 dark:border-yellow-600 dark:bg-yellow-950/55 dark:text-yellow-50',
  proposal: 'border-sky-400 bg-sky-50 text-sky-950 shadow-sky-950/10 dark:border-sky-500 dark:bg-sky-950/55 dark:text-sky-50',
};

const nodeAccentClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'bg-slate-500',
  pending: 'bg-emerald-500',
  edited: 'bg-amber-500',
  proposal: 'bg-sky-400',
};

const edgeColor: Record<WorkspaceMindmapStatus, string> = {
  applied: '#94a3b8',
  pending: '#10b981',
  edited: '#f59e0b',
  proposal: '#38bdf8',
};

function getWorkspaceNodeIcon(kind: WorkspaceNode['kind']) {
  if (kind === 'course') return Network;
  if (kind === 'chapter') return GitBranch;
  if (kind === 'lesson') return CircleDot;
  if (kind === 'unit') return MapIcon;
  if (kind === 'component') return HelpCircle;
  if (kind === 'media_brief') return ImageIcon;
  return FileText;
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

export function WorkspaceGraphNode({ data, selected }: NodeProps<FlowNode>) {
  const { node, locale, childCount, expanded, onExpand } = data;
  const c = workspaceCopy[locale];
  const status = workspaceMindmapStatus(node);
  const Icon = getWorkspaceNodeIcon(node.kind);
  const kindLabel = workspaceNodeTypeLabel(node, locale);
  const stateLabel = status === 'proposal' ? c.proposal : status === 'applied' ? c.appliedSuccessfully
    : status === 'edited' ? c.editedPendingApply : node.content_state === 'content_ready' ? c.pendingApply : c[node.content_state];
  return <div className={`group relative h-[144px] w-[260px] animate-in overflow-hidden rounded-lg border shadow-md transition-shadow duration-200 motion-reduce:animate-none ${nodeShellClassName[status]}
    ${selected ? 'ring-2 ring-primary/35 shadow-xl' : 'hover:shadow-lg'} cursor-grab active:cursor-grabbing`}>
    <Handle id="left" type="target" position={Position.Left} isConnectable={false}
      className="!h-3 !w-3 !border-2 !border-background !bg-primary !opacity-0 transition-opacity group-hover:!opacity-100" />
    <Handle id="right" type="source" position={Position.Right} isConnectable={false}
      className="!h-3 !w-3 !border-2 !border-background !bg-primary !opacity-0 transition-opacity group-hover:!opacity-100" />
    <div className={`h-1.5 w-full ${nodeAccentClassName[status]}`} />
    <div className="p-3">
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/80 text-current ring-1 ring-current/10">{status === 'edited' ? <RefreshCw className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</span>
          <span className="min-w-0 flex-1"><span className="flex flex-wrap gap-1.5"><WorkspaceNodeTypePill node={node} locale={locale} />
            <Badge variant="secondary" className="h-5 rounded-md bg-background/70 px-1.5 text-[10px]">{stateLabel}</Badge></span>
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
    { label: c.chapterCount, icon: GitBranch, tone: 'text-primary bg-primary/10 border-primary/20' },
    { label: c.sectionCount, icon: ListTree, tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20 dark:text-violet-300' },
    { label: c.lessonCount, icon: BookOpenCheck, tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300' },
    { label: c.interactiveCount, icon: Blocks, tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300' },
  ] as const;
};

const pendingNodeTone = {
  course: 'border-blue-500/30 bg-blue-500/[0.08] text-blue-500 shadow-blue-950/10 dark:text-blue-300',
  chapter: 'border-violet-500/30 bg-violet-500/[0.08] text-violet-500 shadow-violet-950/10 dark:text-violet-300',
  lesson: 'border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-600 shadow-cyan-950/10 dark:text-cyan-300',
  unit: 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-600 shadow-emerald-950/10 dark:text-emerald-300',
  component: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-600 shadow-amber-950/10 dark:text-amber-300',
} as const;

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
  const Icon = getWorkspaceNodeIcon(kind);
  return <motion.div initial={{ opacity: 0, scale: 0.96, x: -8 }} animate={{ opacity: 1, scale: 1, x: 0 }}
    transition={{ duration: 0.35, delay }}
    style={{ left: x, top: y }}
    className={`absolute h-[118px] w-[244px] overflow-hidden rounded-2xl border bg-card/95 shadow-[0_18px_45px_-28px_currentColor] backdrop-blur-sm ${pendingNodeTone[kind]}`}>
    <div className="h-1 w-full bg-current opacity-80" />
    <div className="flex gap-3 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-background/75 shadow-sm"><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><span className="inline-flex rounded-full border border-current/20 bg-background/65 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em]">{label}</span>
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-35" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" /></span></div>
        <div className="mt-3 animate-pulse space-y-2" aria-hidden><div className="h-3 w-11/12 rounded-full bg-current/[0.20] dark:bg-current/[0.13]" /><div className="h-3 w-7/12 rounded-full bg-current/[0.14] dark:bg-current/[0.09]" /></div>
      </div>
    </div>
  </motion.div>;
}

/** Visible product-shaped loading shell used before the first committed graph.
 * Labels are static UI copy; only unknown values and provider-owned content
 * use skeleton bars. No planned title/count is synthesized on the client. */
export function WorkspacePendingSkeleton({ locale, stage }: { locale: WorkspaceLocale; stage: 'overview' | 'mindmap' }) {
  const c = workspaceCopy[locale];
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}
    className="h-full min-h-[320px] overflow-y-auto p-4 sm:p-5" role="status" aria-live="polite">
    <span className="sr-only">{stage === 'overview' ? c.emptyOverview : c.empty}</span>
    {stage === 'overview' ? <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{pendingOverviewMetrics(locale).map(item => { const Icon = item.icon; return <div key={item.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4.5 w-4.5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><div className="h-5 w-10 animate-pulse rounded bg-muted" aria-hidden /><p className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted-foreground">{item.label}</p></div>
      </div>; })}</div>
      <WorkspaceCourseOverviewSkeleton locale={locale} />
      <section className="rounded-2xl border border-primary/20 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><GitBranch className="h-5 w-5" aria-hidden /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{c.chapters}</p><div className="mt-2 h-4 w-48 max-w-[55vw] animate-pulse rounded bg-muted" aria-hidden /></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{[0, 1].map(index => <div key={index} className="rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">{c.chapter} {index + 1} · {c.outcomes}</p>
          <div className="mt-3 animate-pulse space-y-2" aria-hidden><div className="h-3 w-5/6 rounded bg-violet-500/10" /><div className="h-3 w-2/3 rounded bg-violet-500/10" /></div>
        </div>)}</div>
      </section>
    </div> : <div className="h-full w-full overflow-auto" aria-hidden>
      <div data-pending-mindmap-canvas className="relative mx-auto h-[560px] w-[1180px] overflow-hidden rounded-3xl border border-border/45 bg-background shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),0_24px_70px_-55px_hsl(var(--primary))]"
        style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground) / 0.2) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_45%,hsl(var(--primary)/0.08),transparent_38%),linear-gradient(to_bottom,hsl(var(--background)/0.2),hsl(var(--background)/0.78))]" />
        <div className="absolute left-1/2 top-5 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/20 bg-card/90 px-4 py-2 shadow-lg backdrop-blur-md">
          <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span>
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
            <linearGradient id="pending-map-edge-shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="0.48" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#7dd3fc" stopOpacity="0" />
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
            <path data-pending-edge-shimmer d={pendingMindmapEdgePath(edge.from, edge.to)} fill="none" stroke="url(#pending-map-edge-shimmer)"
              vectorEffect="non-scaling-stroke" strokeWidth="3" strokeLinecap="round" strokeDasharray="24 96"
              className="motion-reduce:hidden">
              <animate attributeName="stroke-dashoffset" from="120" to="0" dur={`${1.35 + index * 0.06}s`}
                begin={`${index * 0.12}s`} repeatCount="indefinite" />
            </path>
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
  if (status.failure_code === 'ORCHESTRATION_V2_EXECUTION_RUNTIME_CHANGED') return {
    stage, message: vi ? 'Cấu hình AI của doanh nghiệp đã thay đổi trong lúc tạo nội dung.' : 'The organization AI configuration changed while content was being created.',
    note: vi ? 'Yêu cầu của bước này chưa được gửi đến AI và không phát sinh lượt gọi cho lần thử đó.' : 'This step was not sent to the AI provider, so that attempt did not create a provider call.',
  };
  if (status.failure_code === 'AI_PROVIDER_AUTH_REJECTED') return {
    stage, message: vi ? 'Nhà cung cấp AI từ chối thông tin xác thực. Hãy kiểm tra API key của doanh nghiệp.' : 'The AI provider rejected the credentials. Check the organization API key.', note: null,
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
  return <div className={`${compact ? 'mx-4 my-3 sm:mx-5' : 'm-4 max-w-2xl'} flex flex-col gap-3 rounded-2xl border p-4 text-sm ${isFailure && !contentCommitted ? 'border-destructive/35 bg-destructive/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.06]'}`} role={isFailure && !contentCommitted ? 'alert' : 'status'} aria-live="polite">
    <div className="flex items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isFailure && !contentCommitted ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}><AlertTriangle className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0"><p className="font-semibold">{c[status.status]}</p><p className="mt-1 leading-6 text-muted-foreground">{isFailure && status.failure_code ? failure.message : message}</p>
        {failure.stage && <p className="mt-1 text-xs font-medium text-foreground">{locale === 'vi' ? 'Bước gặp lỗi' : 'Failed step'}: {failure.stage}</p>}
        {failure.note && <p className="mt-1 text-xs leading-5 text-muted-foreground">{failure.note}</p>}
      </div></div>
    <div className="flex flex-wrap items-center gap-2">{onRefresh && <Button type="button" variant="outline" size="sm" onClick={onRefresh}>{c.terminalReload}</Button>}
      {isFailure && <p className="text-xs text-muted-foreground">{locale === 'vi' ? 'Sau khi xử lý nguyên nhân, đóng cửa sổ và chọn Tạo nội dung bài học để tạo một bản thiết kế khoá học mới.' : 'After resolving the cause, close this window and choose Create lesson content to start a new draft.'}</p>}</div>
  </div>;
}

function Overview({ graph, details, locale, loading, terminal, onRefresh }: { graph: WorkspaceGraph | null;
  details: readonly WorkspaceTypedDetail[]; locale: WorkspaceLocale; loading: boolean;
  terminal: WorkspaceStatus | null; onRefresh?: () => void }) {
  const c = workspaceCopy[locale];
  if (!graph?.overview_ready) return loading ? <WorkspacePendingSkeleton locale={locale} stage="overview" />
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
  const onExpand = useCallback((id: string, expanded: boolean) => {
    // A manual drag is browser-local. Once topology changes, the deterministic
    // tree layout must become authoritative again or newly revealed nodes can overlap it.
    setNodePositions({});
    setExpansion(prev => expanded ? { ...prev, [id]: true } : collapseWorkspaceBranch(graph, prev, id));
  }, [graph]);
  const runActive = state.status?.status === 'queued' || state.status?.status === 'designing' || state.status?.status === 'drafting';
  const terminal = state.status && ['ready', 'needs_action', 'failed', 'canceled'].includes(state.status.status)
    ? state.status : null;
  const overviewLoading = canRead && runActive && !graph?.overview_ready;
  const mindmapLoading = canRead && runActive && !graph?.structure_ready;
  useEffect(() => { setNodePositions({}); }, [graph?.workspace_id]);
  useEffect(() => {
    const initial = initialWorkspaceExpansion(graph, state.status);
    if (!graph || initial === null || initializedExpansionWorkspace.current === graph.workspace_id) return;
    initializedExpansionWorkspace.current = graph.workspace_id;
    setExpansion(initial);
    setNodePositions({});
  }, [graph, state.status]);
  useEffect(() => {
    if (!graph) {
      revealWorkspace.current = null; revealQueue.current = []; revealedNodeIdsRef.current = new Set();
      availableNodeIdsRef.current = new Set();
      if (revealTimer.current !== null) window.clearTimeout(revealTimer.current);
      revealTimer.current = null; setRevealedNodeIds(new Set()); return;
    }
    const ordered = projectWorkspaceGraph(graph, {}).map(item => item.node.node_id);
    const available = new Set(ordered);
    availableNodeIdsRef.current = available;
    const newWorkspace = revealWorkspace.current !== graph.workspace_id;
    if (newWorkspace) {
      revealWorkspace.current = graph.workspace_id; revealQueue.current = [];
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
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (!runActive || reducedMotion) {
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
  }, [graph, runActive]);
  useEffect(() => () => { if (revealTimer.current !== null) window.clearTimeout(revealTimer.current); }, []);
  const projection = useMemo(() => projectWorkspaceGraph(graph, expansion)
    .filter(item => revealedNodeIds.has(item.node.node_id)), [graph, expansion, revealedNodeIds]);
  const expandableNodeIds = useMemo(() => {
    if (!graph) return [];
    const parents = new Set(graph.nodes.map(node => node.parent_id).filter((value): value is string => value !== null));
    return graph.nodes.filter(node => parents.has(node.node_id)).map(node => node.node_id);
  }, [graph]);
  const allExpanded = expandableNodeIds.length > 0 && expandableNodeIds.every(id => {
    return expansion[id] ?? true;
  });
  const toggleAllNodes = useCallback(() => {
    setNodePositions({});
    if (allExpanded) setExpansion(collapseWorkspaceToChapterLevel(graph));
    else setExpansion(Object.fromEntries(expandableNodeIds.map(id => [id, true])));
    setFitRequest(value => value + 1);
  }, [allExpanded, expandableNodeIds, graph]);
  const nodes = useMemo<FlowNode[]>(() => projection.map(p => ({ id: p.node.node_id, type: 'workspace', position: nodePositions[p.node.node_id] ?? p.position,
    data: { ...p, locale, onExpand }, draggable: true, connectable: false, selectable: true,
    ariaLabel: `${c.inspect}: ${p.node.title ?? c[p.node.kind]}`,
  })), [projection, locale, nodePositions, onExpand, c]);
  const edges = useMemo<Edge[]>(() => {
    const visible = new Set(nodes.map(n => n.id));
    return nodes.flatMap(n => n.data.node.parent_id && visible.has(n.data.node.parent_id)
      ? [{ id: `edge:${n.id}`, source: n.data.node.parent_id, target: n.id, sourceHandle: 'right', targetHandle: 'left', type: 'smoothstep', selectable: false,
        animated: workspaceMindmapStatus(n.data.node) !== 'applied', markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor[workspaceMindmapStatus(n.data.node)], width: 18, height: 18 },
        style: { stroke: edgeColor[workspaceMindmapStatus(n.data.node)], strokeWidth: workspaceMindmapStatus(n.data.node) === 'applied' ? 1.6 : 2.4 } }] : []);
  }, [nodes]);
  /** Keep the same controlled Flow lifecycle as the established Blueprint map:
   * React Flow owns the in-progress drag, while the browser-local cache makes
   * its final position survive a realtime graph repaint. */
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(edges);
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
    if (dragGuard.current.dragging || Date.now() - dragGuard.current.lastDragEndedAt < 180) return;
    onSelectNode(node.id);
  }, [onSelectNode]);
  const rememberViewport = useCallback((_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
    if (graph?.workspace_id) viewportByWorkspace.current.set(graph.workspace_id, viewport);
  }, [graph?.workspace_id]);
  const initializeFlow = useCallback((instance: ReactFlowInstance<FlowNode, Edge>) => {
    fitFlow.current = () => { void instance.fitView({ padding: 0.22, duration: 450 }); };
    const workspaceId = graph?.workspace_id;
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
  }, [graph?.workspace_id]);
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
      {terminal && (terminal.status === 'needs_action' || terminal.status === 'failed') && (graph?.overview_ready || graph?.structure_ready)
        && <WorkspaceTerminalPanel locale={locale} status={terminal} onRefresh={onRefresh} compact />}
      {toolbar && <div className="max-h-[25dvh] shrink-0 overflow-y-auto border-b bg-background px-4 py-2 sm:px-5">{toolbar}</div>}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b bg-muted/10 px-3 py-2 sm:px-5">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/35 p-1 dark:bg-muted/20">
            <TabsTrigger value="overview" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm"><Target className="h-3.5 w-3.5" />{c.overview}</TabsTrigger>
            <TabsTrigger value="mindmap" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm"><MapIcon className="h-3.5 w-3.5" />{c.mindmap}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {canRead ? <Overview graph={graph} details={details} locale={locale} loading={overviewLoading} terminal={terminal} onRefresh={onRefresh} /> : <p className="p-4">{state.access === 'blocked' ? c.unavailable : c.unknown}</p>}
        </TabsContent>
        <TabsContent value="mindmap" className="relative mt-0 min-h-0 flex-1 overflow-hidden bg-background">
          {nodes.length > 0 ? <div className="h-full w-full min-h-0"><ReactFlowProvider><ReactFlow<FlowNode> nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick} onNodeDragStart={onNodeDragStart} onNodeDragStop={onNodeDragStop}
            onInit={initializeFlow} onMoveEnd={rememberViewport}
            defaultViewport={graph?.workspace_id ? viewportByWorkspace.current.get(graph.workspace_id) : undefined}
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
                    <p className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />{c.legendPending}</p>
                    <p className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />{c.legendEdited}</p>
                    <p className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-500" />{c.legendApplied}</p>
                    <p className="flex gap-2"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400" />{c.legendProposal}</p>
                  </div>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="nodrag nopan h-9 gap-2 bg-card shadow-lg" onClick={toggleAllNodes}>
                <Rows3 className="h-4 w-4" aria-hidden />{allExpanded ? c.collapseAll : c.expandAll}
              </Button>
            </Panel>
            {runActive && state.status && state.status.unit_count > 0 && <Panel position="top-left" className="!m-3">
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-card/95 px-3 py-2 text-xs shadow-lg backdrop-blur" role="status" aria-live="polite">
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span>
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
      {renderNodeDetail ? renderNodeDetail(open ? selected : null) : <WorkspaceNodeDetail node={open ? selected : null} detail={detail} locale={locale} stale={state.detailStale}
        onClose={() => onSelectNode(null)} />}
  </div>;
}
