import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  BookOpenCheck,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FileText,
  GitBranch,
  HelpCircle,
  Image as ImageIcon,
  Layers3,
  Map as MapIcon,
  Network,
  RefreshCw,
  Shuffle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { CourseIndexResponse, CourseIndexSection } from '@/api/custom-course-authoring';
import type {
  LessonAuthorComponentProposal,
  LessonAuthorProposal,
  LessonAuthorProposalEvent,
  LessonAuthorUnitProposal,
} from '@/api/custom-chat';

type MindmapStatus = 'existing' | 'planned-create' | 'planned-update';

interface MindmapNode {
  id: string;
  title: string;
  label: string;
  blockType: string;
  status: MindmapStatus;
  children: MindmapNode[];
  componentType?: string;
}

interface MindmapStats {
  existing: number;
  created: number;
  updated: number;
  components: number;
}

interface MindmapFlowNodeData extends Record<string, unknown> {
  title: string;
  label: string;
  blockType: string;
  status: MindmapStatus;
  childCount: number;
  collapsible: boolean;
  expanded: boolean;
  justRevealed: boolean;
  revealDelayMs: number;
}

interface LessonAuthorMindmapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outline: CourseIndexResponse | null;
  proposalEvent: LessonAuthorProposalEvent | null;
  loading?: boolean;
  error?: string | null;
}

const statusLabel: Record<MindmapStatus, string> = {
  existing: 'Đã có',
  'planned-create': 'Sẽ tạo mới',
  'planned-update': 'Sẽ cập nhật',
};

const statusClassName: Record<MindmapStatus, string> = {
  existing: 'border-slate-300/60 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
  'planned-create': 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
  'planned-update': 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200',
};

const nodeShellClassName: Record<MindmapStatus, string> = {
  existing: 'border-border bg-background text-foreground shadow-sm',
  'planned-create': 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-emerald-950/5 dark:border-emerald-700 dark:bg-emerald-950/55 dark:text-emerald-50',
  'planned-update': 'border-amber-300 bg-amber-50 text-amber-950 shadow-amber-950/5 dark:border-amber-700 dark:bg-amber-950/55 dark:text-amber-50',
};

const nodeAccentClassName: Record<MindmapStatus, string> = {
  existing: 'bg-slate-500',
  'planned-create': 'bg-emerald-500',
  'planned-update': 'bg-amber-500',
};

const edgeColor: Record<MindmapStatus, string> = {
  existing: '#94a3b8',
  'planned-create': '#10b981',
  'planned-update': '#f59e0b',
};

const nodeTypes = {
  mindmapNode: MindmapFlowNode,
};

function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getOutlineChildren(node: CourseIndexSection): CourseIndexSection[] {
  return node.children || node.child_info?.children || [];
}

function getBlockLabel(blockType: string): string {
  if (blockType === 'course') return 'Khóa học';
  if (blockType === 'chapter') return 'Section';
  if (blockType === 'sequential') return 'Subsection';
  if (blockType === 'vertical') return 'Unit';
  return getComponentTypeLabel(blockType);
}

function getComponentTypeLabel(type: string): string {
  if (type === 'html') return 'Nội dung lý thuyết';
  if (type === 'problem') return 'Câu hỏi kiểm tra';
  if (type === 'la_image_choice_quiz') return 'Câu hỏi đáp án hình ảnh';
  if (type === 'la_faq') return 'Hỏi đáp';
  if (type === 'la_sortable') return 'Sắp xếp ô chữ';
  if (type === 'la_crossword') return 'Đố vui ô chữ';
  if (type === 'la_diagram') return 'Sơ đồ trực quan';
  return 'Nội dung tương tác';
}

function getComponentIcon(type: string) {
  if (type === 'course') return Network;
  if (type === 'html') return FileText;
  if (type === 'problem') return HelpCircle;
  if (type === 'la_image_choice_quiz') return ImageIcon;
  if (type === 'la_faq') return BookOpenCheck;
  if (type === 'la_sortable') return Shuffle;
  if (type === 'la_crossword') return Layers3;
  if (type === 'la_diagram') return Network;
  if (type === 'chapter') return GitBranch;
  if (type === 'sequential') return MapIcon;
  if (type === 'vertical') return CircleDot;
  return FileText;
}

function outlineToMindmapNode(node: CourseIndexSection): MindmapNode {
  const blockType = node.block_type || node.category || 'unknown';
  return {
    id: node.id,
    title: node.display_name || '(Không tên)',
    label: getBlockLabel(blockType),
    blockType,
    status: 'existing',
    children: getOutlineChildren(node).map(outlineToMindmapNode),
    componentType: blockType,
  };
}

function cloneNode(node: MindmapNode): MindmapNode {
  return {
    ...node,
    children: node.children.map(cloneNode),
  };
}

function markPlannedUpdate(node: MindmapNode) {
  if (node.status === 'existing') node.status = 'planned-update';
}

function findChildByTitle(parent: MindmapNode, title: string, blockType: string): MindmapNode | undefined {
  const normalized = normalizeTitle(title);
  return parent.children.find(child =>
    child.blockType === blockType && normalizeTitle(child.title) === normalized,
  );
}

function makePlannedNode(id: string, title: string, blockType: string): MindmapNode {
  return {
    id,
    title,
    label: getBlockLabel(blockType),
    blockType,
    status: 'planned-create',
    children: [],
    componentType: blockType,
  };
}

function getUnitComponents(unit: LessonAuthorUnitProposal): LessonAuthorComponentProposal[] {
  if (Array.isArray(unit.components) && unit.components.length > 0) return unit.components;
  if (unit.html) {
    return [{
      type: 'html',
      title: unit.title || 'Nội dung lý thuyết',
      data: unit.html,
    }];
  }
  return [];
}

function mergeComponent(parent: MindmapNode, component: LessonAuthorComponentProposal, index: number) {
  const componentType = component.type || 'html';
  const title = component.title || getComponentTypeLabel(componentType);
  const matched = findChildByTitle(parent, title, componentType);
  if (matched) {
    markPlannedUpdate(matched);
    return;
  }

  parent.children.push(makePlannedNode(
    `planned-component-${parent.id}-${index}-${normalizeTitle(title)}`,
    title,
    componentType,
  ));
}

function mergeProposal(root: MindmapNode, proposal: LessonAuthorProposal | null | undefined): MindmapNode {
  const next = cloneNode(root);
  const chapters = Array.isArray(proposal?.chapters) ? proposal.chapters : [];
  if (chapters.length === 0) return next;

  chapters.forEach((chapter, chapterIndex) => {
    const chapterTitle = chapter.title || `Section ${chapterIndex + 1}`;
    const chapterNode = findChildByTitle(next, chapterTitle, 'chapter')
      ?? makePlannedNode(`planned-chapter-${chapterIndex}`, chapterTitle, 'chapter');
    if (!next.children.includes(chapterNode)) next.children.push(chapterNode);
    else markPlannedUpdate(chapterNode);

    const lessons = Array.isArray(chapter.lessons) ? chapter.lessons : [];
    lessons.forEach((lesson, lessonIndex) => {
      const lessonTitle = lesson.title || `Subsection ${lessonIndex + 1}`;
      const lessonNode = findChildByTitle(chapterNode, lessonTitle, 'sequential')
        ?? makePlannedNode(`planned-lesson-${chapterIndex}-${lessonIndex}`, lessonTitle, 'sequential');
      if (!chapterNode.children.includes(lessonNode)) chapterNode.children.push(lessonNode);
      else markPlannedUpdate(lessonNode);

      const units = Array.isArray(lesson.units) ? lesson.units : [];
      units.forEach((unit, unitIndex) => {
        const unitTitle = unit.title || `Unit ${unitIndex + 1}`;
        const unitNode = findChildByTitle(lessonNode, unitTitle, 'vertical')
          ?? makePlannedNode(`planned-unit-${chapterIndex}-${lessonIndex}-${unitIndex}`, unitTitle, 'vertical');
        if (!lessonNode.children.includes(unitNode)) lessonNode.children.push(unitNode);
        else markPlannedUpdate(unitNode);

        getUnitComponents(unit).forEach((component, componentIndex) => {
          mergeComponent(unitNode, component, componentIndex);
        });
      });
    });
  });

  return next;
}

function countStats(node: MindmapNode): MindmapStats {
  return node.children.reduce<MindmapStats>((acc, child) => {
    const childStats = countStats(child);
    acc.existing += child.status === 'existing' ? 1 : 0;
    acc.created += child.status === 'planned-create' ? 1 : 0;
    acc.updated += child.status === 'planned-update' ? 1 : 0;
    acc.components += isComponentNode(child) ? 1 : 0;
    acc.existing += childStats.existing;
    acc.created += childStats.created;
    acc.updated += childStats.updated;
    acc.components += childStats.components;
    return acc;
  }, { existing: 0, created: 0, updated: 0, components: 0 });
}

function isComponentNode(node: MindmapNode): boolean {
  return !['course', 'chapter', 'sequential', 'vertical'].includes(node.blockType);
}

function createEmptyRoot(proposalEvent: LessonAuthorProposalEvent | null): MindmapNode {
  return {
    id: proposalEvent?.job_id ? `proposal-${proposalEvent.job_id}` : 'lesson-author-proposal',
    title: 'Outline khóa học',
    label: 'Khóa học',
    blockType: 'course',
    status: 'existing',
    children: [],
  };
}

function getDescendantCount(node: MindmapNode): number {
  return node.children.reduce((total, child) => total + 1 + getDescendantCount(child), 0);
}

function toFlow(
  root: MindmapNode,
  expandedNodeIds: Set<string>,
  revealParentId: string | null,
): { nodes: Node<MindmapFlowNodeData>[]; edges: Edge[] } {
  const nodes: Node<MindmapFlowNodeData>[] = [];
  const edges: Edge[] = [];
  let leafIndex = 0;
  const depthGap = 310;
  const rowGap = 120;

  const placeNode = (node: MindmapNode, depth: number, parentId?: string, siblingIndex = 0): number => {
    const visibleChildren = expandedNodeIds.has(node.id) ? node.children : [];
    let y: number;
    if (visibleChildren.length === 0) {
      y = leafIndex * rowGap;
      leafIndex += 1;
    } else {
      const childYs = visibleChildren.map((child, index) => placeNode(child, depth + 1, node.id, index));
      y = (Math.min(...childYs) + Math.max(...childYs)) / 2;
    }

    nodes.push({
      id: node.id,
      type: 'mindmapNode',
      position: { x: depth * depthGap, y },
      data: {
        title: node.title,
        label: node.label,
        blockType: node.blockType,
        status: node.status,
        childCount: node.children.length,
        collapsible: node.children.length > 0,
        expanded: expandedNodeIds.has(node.id),
        justRevealed: parentId === revealParentId,
        revealDelayMs: parentId === revealParentId ? siblingIndex * 70 : 0,
      },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}->${node.id}`,
        source: parentId,
        target: node.id,
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'smoothstep',
        animated: node.status !== 'existing',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeColor[node.status],
          width: 18,
          height: 18,
        },
        style: {
          stroke: edgeColor[node.status],
          strokeWidth: node.status === 'existing' ? 1.6 : 2.4,
        },
      });
    }

    return y;
  };

  placeNode(root, 0);

  if (nodes.length > 0) {
    const minY = Math.min(...nodes.map(node => node.position.y));
    nodes.forEach(node => {
      node.position = {
        x: node.position.x + 40,
        y: node.position.y - minY + 40,
      };
    });
  }

  return { nodes, edges };
}

function buildDescendantMap(root: MindmapNode): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const walk = (node: MindmapNode): string[] => {
    const descendants = node.children.flatMap(child => [child.id, ...walk(child)]);
    map.set(node.id, descendants);
    return descendants;
  };
  walk(root);
  return map;
}

function initialExpandedNodeIds(root: MindmapNode): Set<string> {
  return new Set([root.id]);
}

function withoutNodeAndDescendants(
  expandedNodeIds: Set<string>,
  nodeId: string,
  descendantsById: Map<string, string[]>,
): Set<string> {
  const next = new Set(expandedNodeIds);
  next.delete(nodeId);
  descendantsById.get(nodeId)?.forEach(descendantId => next.delete(descendantId));
  return next;
}

export function LessonAuthorMindmapModal({
  open,
  onOpenChange,
  outline,
  proposalEvent,
  loading = false,
  error = null,
}: LessonAuthorMindmapModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <LessonAuthorMindmapContent
          outline={outline}
          proposalEvent={proposalEvent}
          loading={loading}
          error={error}
        />
      )}
    </Dialog>
  );
}

function LessonAuthorMindmapContent({
  outline,
  proposalEvent,
  loading = false,
  error = null,
}: Omit<LessonAuthorMindmapModalProps, 'open' | 'onOpenChange'>) {
  const root = useMemo(() => {
    const baseRoot = outline?.course_structure
      ? outlineToMindmapNode(outline.course_structure)
      : createEmptyRoot(proposalEvent);
    return mergeProposal(baseRoot, proposalEvent?.proposal);
  }, [outline, proposalEvent]);

  const stats = useMemo(() => countStats(root), [root]);
  const totalNodes = useMemo(() => getDescendantCount(root) + 1, [root]);
  const descendantsById = useMemo(() => buildDescendantMap(root), [root]);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => initialExpandedNodeIds(root));
  const [revealParentId, setRevealParentId] = useState<string | null>(null);
  const flow = useMemo(() => toFlow(root, expandedNodeIds, revealParentId), [expandedNodeIds, revealParentId, root]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<MindmapFlowNodeData>>(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);
  const dragGuardRef = useRef({ dragging: false, lastDragEndedAt: 0 });
  const expansionTimerRef = useRef<number | null>(null);
  const jobSuffix = proposalEvent?.job_id ? proposalEvent.job_id.slice(0, 8) : null;

  useEffect(() => {
    setExpandedNodeIds(initialExpandedNodeIds(root));
    setRevealParentId(null);
  }, [root]);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow, setEdges, setNodes]);

  useEffect(() => () => {
    if (expansionTimerRef.current) window.clearTimeout(expansionTimerRef.current);
  }, []);

  const handleNodeDragStart = useCallback(() => {
    dragGuardRef.current.dragging = true;
  }, []);

  const handleNodeDragStop = useCallback(() => {
    dragGuardRef.current.dragging = false;
    dragGuardRef.current.lastDragEndedAt = Date.now();
  }, []);

  const handleNodeClick = useCallback((_event: ReactMouseEvent, node: Node<MindmapFlowNodeData>) => {
    if (dragGuardRef.current.dragging || Date.now() - dragGuardRef.current.lastDragEndedAt < 180) return;
    if (!node.data.collapsible) return;

    if (expansionTimerRef.current) window.clearTimeout(expansionTimerRef.current);
    const isExpanded = expandedNodeIds.has(node.id);

    if (isExpanded) {
      setRevealParentId(null);
      setExpandedNodeIds(previous => withoutNodeAndDescendants(previous, node.id, descendantsById));
      return;
    }

    setRevealParentId(null);
    expansionTimerRef.current = window.setTimeout(() => {
      setExpandedNodeIds(previous => {
        const next = new Set(previous);
        next.add(node.id);
        return next;
      });
      setRevealParentId(node.id);
    }, 120);
  }, [descendantsById, expandedNodeIds]);

  return (
    <DialogContent
      overlayClassName="z-[10040]"
      className="z-[10050] flex h-[88vh] w-[calc(100vw-24px)] max-w-[1280px] grid-rows-none flex-col gap-0 overflow-hidden border-border/70 p-0 shadow-2xl sm:rounded-2xl"
    >
      <DialogHeader className="border-b bg-background/95 px-5 py-4 pr-12 backdrop-blur">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Network className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">Mindmap kế hoạch bài học</DialogTitle>
              <DialogDescription className="mt-1 line-clamp-2">
                Outline hiện tại được ghép với phần nội dung bot sắp tạo hoặc cập nhật sau khi admin approve.
              </DialogDescription>
            </div>
          </div>
      </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 bg-muted/20 lg:grid-cols-[292px_minmax(0,1fr)]">
          <aside className="border-b bg-background/90 p-4 backdrop-blur lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <div className="app-liquid-card rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Tóm tắt plan</p>
                  {jobSuffix && <Badge variant="secondary" className="font-mono text-[10px]">#{jobSuffix}</Badge>}
                </div>
                <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">
                  {proposalEvent?.proposal.summary || 'Chưa có proposal để hiển thị.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <StatTile label="Tổng node" value={totalNodes} />
                <StatTile label="Đã có" value={stats.existing} />
                <StatTile label="Tạo mới" value={stats.created} accent="text-emerald-600 dark:text-emerald-300" />
                <StatTile label="Cập nhật" value={stats.updated} accent="text-amber-600 dark:text-amber-300" />
                <StatTile label="Component" value={stats.components} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chú giải</p>
                <LegendItem status="existing" />
                <LegendItem status="planned-create" />
                <LegendItem status="planned-update" />
              </div>
            </div>
          </aside>

          <main className="relative min-h-0 overflow-hidden bg-background">
            {loading ? (
              <LoadingMindmap />
            ) : error ? (
              <div className="flex min-h-[360px] items-center justify-center">
                <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                  <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
                  <p className="mt-3 text-sm font-semibold">Không tải được mindmap</p>
                  <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[520px] w-full">
                <ReactFlowProvider>
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={handleNodeClick}
                    onNodeDragStart={handleNodeDragStart}
                    onNodeDragStop={handleNodeDragStop}
                    fitView
                    fitViewOptions={{ padding: 0.22, duration: 450 }}
                    minZoom={0.25}
                    maxZoom={1.6}
                    nodesDraggable
                    nodesConnectable={false}
                    elementsSelectable
                    proOptions={{ hideAttribution: true }}
                    className="bg-background"
                    style={{
                      backgroundImage: 'radial-gradient(circle at 20% 20%, hsl(var(--primary) / 0.08), transparent 28%), linear-gradient(180deg, hsl(var(--background)), hsl(var(--muted) / 0.35))',
                    }}
                  >
                    <Controls showInteractive={false} className="!border !border-border !bg-background !shadow-lg" />
                    <MiniMap
                      pannable
                      zoomable
                      className="!border !border-border !bg-background/95 !shadow-lg"
                      nodeStrokeWidth={3}
                      nodeColor={(node) => edgeColor[(node.data?.status as MindmapStatus) ?? 'existing']}
                    />
                    <Background gap={18} size={1} color="hsl(var(--muted-foreground) / 0.18)" />
                  </ReactFlow>
                </ReactFlowProvider>
              </div>
            )}
          </main>
        </div>
    </DialogContent>
  );
}

function LoadingMindmap() {
  return (
    <div className="space-y-3 p-5">
      <div className="h-16 animate-pulse rounded-xl border bg-background" />
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="ml-8 h-12 animate-pulse rounded-xl border bg-background/70" />
      ))}
    </div>
  );
}

function StatTile({ label, value, accent = 'text-foreground' }: { label: string; value: number; accent?: string }) {
  return (
    <div className="app-liquid-card rounded-lg border bg-card px-3 py-2">
      <p className={`text-lg font-semibold leading-none ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function LegendItem({ status }: { status: MindmapStatus }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`h-2.5 w-2.5 rounded-full border ${statusClassName[status]}`} />
      <span className="text-muted-foreground">{statusLabel[status]}</span>
    </div>
  );
}

function MindmapFlowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapFlowNodeData;
  const Icon = getComponentIcon(nodeData.blockType);
  const isChanged = nodeData.status !== 'existing';
  return (
    <div
      className={`group relative w-[250px] overflow-hidden rounded-2xl border shadow-lg transition-all duration-200 ${
        nodeShellClassName[nodeData.status]
      } ${
        selected ? 'ring-2 ring-primary/35 shadow-xl' : 'hover:-translate-y-0.5 hover:shadow-xl'
      } ${
        nodeData.collapsible ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${
        nodeData.justRevealed ? 'animate-in fade-in-0 slide-in-from-left-4 zoom-in-95 duration-500' : ''
      }`}
      style={nodeData.justRevealed ? { animationDelay: `${nodeData.revealDelayMs}ms` } : undefined}
    >
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary !opacity-0 transition-opacity group-hover:!opacity-100"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-background !bg-primary !opacity-0 transition-opacity group-hover:!opacity-100"
      />
      <div className={`h-1.5 w-full ${nodeAccentClassName[nodeData.status]}`} />
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/80 text-current ring-1 ring-current/10">
            {isChanged ? <RefreshCw className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="h-5 rounded-md bg-background/70 px-1.5 text-[10px]">
                {nodeData.label}
              </Badge>
              <Badge variant="secondary" className="h-5 rounded-md bg-background/70 px-1.5 text-[10px]">
                {statusLabel[nodeData.status]}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
              {nodeData.title}
            </p>
            {nodeData.collapsible && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {nodeData.expanded ? `${nodeData.childCount} mục đang mở` : `${nodeData.childCount} mục con`}
              </p>
            )}
          </div>
          {nodeData.collapsible && (
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 text-muted-foreground ring-1 ring-current/10 transition-colors group-hover:text-foreground">
              {nodeData.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
