import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Background, Controls, MarkerType, MiniMap, Panel, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, type ReactFlowInstance, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AlertTriangle, Info, Map as MapIcon, Rows3, Target } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { workspaceReadMessage, type WorkspaceLocale, type WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import type { WorkspaceReadState } from './workspace-read-state';
import { WorkspaceNodeDetail, workspaceCopy, workspaceRunEnded, type WorkspaceTypedDetail } from './workspace-node-detail';
import { WorkspaceAiAvatar } from './workspace-ai-avatar';
import {
  collapsePresentationBranch, collapsePresentationToChapterLevel, initialWorkspaceExpansion, maxAnimatedWorkspaceEdges,
  projectWorkspaceLiveGraph, workspaceBuildingNodeIds, workspacePresentationNodes, workspaceProgressiveRevealQueue,
  type WorkspaceExpansion,
} from './workspace-graph.logic';
import { edgeColor, workspaceBuildAccent, workspaceMindmapStatus } from './workspace-node-visual';
import { workspaceFlowEdgeTypes, workspaceFlowNodeTypes, type FlowData, type FlowNode, type WorkspaceBuildEdge } from './workspace-graph-node';
import { WorkspaceBuildBeacon } from './workspace-build-beacon';
import { WorkspacePendingSkeleton } from './workspace-pending-skeleton';
import { WorkspaceTerminalPanel } from './workspace-terminal-panel';
import { WorkspaceOverview } from './workspace-overview-panel';

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
  /** Presentation-only block above the Overview content (the launch brief). */
  overviewHeader?: ReactNode;
  /** Run-level panel above the overview header (the "Chờ duyệt" review list). */
  overviewNotice?: ReactNode;
  renderNodeDetail?: (node: WorkspaceNode | null) => ReactNode;
  assistantAvatarSrc?: string | null;
  /** Authorized conversation display name for this exact workspace. */
  draftTitle?: string | null;
  /** Explicit, authorized read only. Never starts or retries generation. */
  onRefresh?: () => void;
  /** Owner Stop / Continue / Rewrite controls. Presentation slots only: the host
   * owns the requests and the server decides what is allowed. */
  headerActions?: ReactNode;
  /** Stopped-design notice with its actions, shown above the tabs. */
  recoveryBanner?: ReactNode;
  /** The same actions without the notice, inside the terminal panel. */
  recoveryActions?: ReactNode;
  renderChapterAction?: (chapter: WorkspaceNode) => ReactNode;
  renderNodeAction?: (node: WorkspaceNode) => ReactNode;
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
export function WorkspaceDialogBody({ open, onOpenChange, state, locale, onSelectNode, overviewDetails = [], toolbar, overviewHeader, overviewNotice, renderNodeDetail, assistantAvatarSrc, draftTitle, onRefresh,
  headerActions, recoveryBanner, recoveryActions, renderChapterAction, renderNodeAction }: WorkspaceDialogProps) {
  const c = workspaceCopy[locale];
  const [tab, setTab] = useState('overview');
  const [expansion, setExpansion] = useState<WorkspaceExpansion>({});
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
    data: { ...p, locale, onExpand, runEnded, renderAction: renderNodeAction }, draggable: !p.preview, connectable: false, selectable: !p.preview,
    ariaLabel: p.preview ? `${p.node.title ?? c[p.node.kind]}: ${locale === 'vi' ? 'đang tạo' : 'generating'}` : `${c.inspect}: ${p.node.title ?? c[p.node.kind]}`,
  })), [projection, locale, nodePositions, onExpand, c, runEnded, renderNodeAction]);
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
  // The stopped-design notice goes above the tabs unless this tab already shows
  // the terminal panel (which then carries the same actions).
  const terminalPanelVisible = !!terminal && (tab === 'overview'
    ? canRead && !graph?.overview_ready && !preview && !overviewLoading
    : nodes.length === 0 && !mindmapLoading);
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <span className="sr-only" ref={node => { if (node && !returnFocus.current) { returnFocus.current = document.activeElement as HTMLElement; } }} />
      <header className="flex shrink-0 items-start justify-between gap-3 border-b bg-card px-4 py-3 pr-4 sm:px-5 sm:py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <WorkspaceAiAvatar src={assistantAvatarSrc} compact />
          <div className="min-w-0"><DialogTitle className="truncate text-base font-semibold">{draftTitle?.trim() || c.title}</DialogTitle><DialogDescription className="mt-1 line-clamp-2">{c.review}</DialogDescription></div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
          <DialogClose asChild><Button ref={closeButton} variant="outline" size="sm">{c.close}</Button></DialogClose>
        </div>
      </header>
      {visibleReadError && <p role="alert" className="mx-4 mt-3 shrink-0 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm sm:mx-5">{workspaceReadMessage(visibleReadError.code, locale)}</p>}
      {/* A committed graph is the user's actionable state. Terminal workflow
       * diagnostics stay in telemetry; a reload button cannot repair them and
       * must not displace or discredit already saved course-design content. */}
      {toolbar && <div className="max-h-[25dvh] shrink-0 overflow-y-auto border-b bg-background px-4 py-2 sm:px-5">{toolbar}</div>}
      {canRead && recoveryBanner && !terminalPanelVisible && <div className="shrink-0 border-b bg-background px-4 py-2 sm:px-5">{recoveryBanner}</div>}
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 overflow-x-auto border-b bg-muted/10 px-3 py-2 sm:px-5">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/35 p-1 dark:bg-muted/20">
            <TabsTrigger value="overview" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm"><Target className="h-3.5 w-3.5" />{c.overview}</TabsTrigger>
            <TabsTrigger value="mindmap" className="h-9 w-full gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-background/70 hover:text-foreground data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-sm"><MapIcon className="h-3.5 w-3.5" />{c.mindmap}</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="mt-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {canRead && overviewNotice}
          {canRead && overviewHeader}
          {canRead ? <WorkspaceOverview graph={graph} preview={preview} details={details} locale={locale} loading={overviewLoading} terminal={terminal} onRefresh={onRefresh}
            terminalActions={recoveryActions} renderChapterAction={renderChapterAction} /> : <p className="p-4">{state.access === 'blocked' ? c.unavailable : c.unknown}</p>}
        </TabsContent>
        <TabsContent value="mindmap" className="relative mt-0 min-h-0 flex-1 overflow-hidden bg-background">
          {nodes.length > 0 ? <div className="h-full w-full min-h-0"><ReactFlowProvider><ReactFlow<FlowNode, WorkspaceBuildEdge> nodes={flowNodes} edges={flowEdges} nodeTypes={workspaceFlowNodeTypes} edgeTypes={workspaceFlowEdgeTypes}
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
                  className="workspace-guide-pulse flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/60 bg-amber-50 text-amber-700 shadow-lg transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-500/50 dark:bg-amber-950/80 dark:text-amber-300 dark:hover:bg-amber-950">
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
          </ReactFlow></ReactFlowProvider></div> : mindmapLoading ? <WorkspacePendingSkeleton locale={locale} stage="mindmap" /> : terminal ? <WorkspaceTerminalPanel locale={locale} status={terminal} onRefresh={onRefresh} actions={recoveryActions} />
            : <p className="p-4" role="status">{state.access === 'blocked' ? c.unavailable : c.empty}</p>}
        </TabsContent>
      </Tabs>
      {renderNodeDetail ? renderNodeDetail(open ? selected : null) : <WorkspaceNodeDetail node={open ? selected : null} detail={detail} locale={locale} stale={state.detailStale} runEnded={runEnded}
        onClose={() => onSelectNode(null)} />}
  </div>;
}
