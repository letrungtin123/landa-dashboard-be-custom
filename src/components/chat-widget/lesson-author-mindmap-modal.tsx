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
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import type { CourseIndexResponse, CourseIndexSection } from '@/api/custom-course-authoring';
import type {
  LessonAuthorBlueprint,
  LessonAuthorBlueprintEvent,
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
  blueprintEvent?: LessonAuthorBlueprintEvent | null;
  loading?: boolean;
  error?: string | null;
}

export interface LessonAuthorMindmapPanelProps extends Omit<LessonAuthorMindmapModalProps, 'open' | 'onOpenChange'> {
  embedded?: boolean;
}

function getStatusLabel(status: MindmapStatus): string {
  return i18n.t(`mindmap.${status === 'existing' ? 'existing' : status === 'planned-create' ? 'plannedCreate' : 'plannedUpdate'}`);
}

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

type Translate = (key: string) => string;

const moduleTranslate: Translate = key => i18n.t(key);
const structureLabelFallbacks = {
  vi: {
    course: 'Khóa học',
    chapter: 'Chương',
    sequential: 'Mục',
    vertical: 'Bài học',
  },
  en: {
    course: 'Course',
    chapter: 'Chapter',
    sequential: 'Section',
    vertical: 'Lesson',
  },
} as const;

function normalizeMindmapBlockType(blockType: string): string {
  const translationKeyMatch = blockType.match(/^common\.courseComponentTypes\.(course|chapter|sequential|vertical)$/);
  return translationKeyMatch?.[1] || blockType;
}

function getBlockLabel(
  blockType: string,
  translate: Translate = moduleTranslate,
  locale = i18n.language,
): string {
  const normalizedBlockType = normalizeMindmapBlockType(blockType);
  const fallbackLocale = locale === 'en' ? 'en' : 'vi';
  if (normalizedBlockType in structureLabelFallbacks.vi) {
    const key = `common.courseComponentTypes.${normalizedBlockType}`;
    const translated = translate(key);
    return translated === key
      ? structureLabelFallbacks[fallbackLocale][normalizedBlockType as keyof typeof structureLabelFallbacks.vi]
      : translated;
  }
  return getComponentTypeLabel(normalizedBlockType, translate);
}

function getFallbackStructureTitle(blockType: string, index: number): string {
  return `${getBlockLabel(blockType)} ${index + 1}`;
}

function getComponentTypeLabel(type: string, translate: Translate = moduleTranslate): string {
  if (type === 'html') return translate('mindmap.theoryContent');
  if (type === 'problem') return translate('mindmap.checkQuestion');
  if (type === 'la_image_choice_quiz') return translate('mindmap.imageChoiceQuestion');
  if (type === 'la_faq') return translate('mindmap.faq');
  if (type === 'la_sortable') return translate('mindmap.sortable');
  if (type === 'la_crossword') return translate('mindmap.crossword');
  if (type === 'la_diagram') return translate('mindmap.diagram');
  return translate('mindmap.interactiveContent');
}

function resolveMindmapNodeLabel(
  label: string,
  blockType: string,
  translate: Translate,
  locale: string,
): string {
  const normalizedBlockType = normalizeMindmapBlockType(blockType);
  const isStructureNode = ['course', 'chapter', 'sequential', 'vertical'].includes(normalizedBlockType);
  const isTranslationKey = /^(common|mindmap)\./.test(label.trim());

  if (isStructureNode || !label.trim() || isTranslationKey) {
    return getBlockLabel(normalizedBlockType, translate, locale);
  }

  return label;
}

function getComponentIcon(type: string) {
  const normalizedType = normalizeMindmapBlockType(type);
  if (normalizedType === 'course') return Network;
  if (normalizedType === 'html') return FileText;
  if (normalizedType === 'problem') return HelpCircle;
  if (normalizedType === 'la_image_choice_quiz') return ImageIcon;
  if (normalizedType === 'la_faq') return BookOpenCheck;
  if (normalizedType === 'la_sortable') return Shuffle;
  if (normalizedType === 'la_crossword') return Layers3;
  if (normalizedType === 'la_diagram') return Network;
  if (normalizedType === 'chapter') return GitBranch;
  if (normalizedType === 'sequential') return MapIcon;
  if (normalizedType === 'vertical') return CircleDot;
  return FileText;
}

function outlineToMindmapNode(node: CourseIndexSection): MindmapNode {
  const blockType = normalizeMindmapBlockType(node.block_type || node.category || 'unknown');
  return {
    id: node.id,
    title: node.display_name || i18n.t('mindmap.unnamed'),
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
      title: unit.title || i18n.t('mindmap.theoryContent'),
      data: unit.html,
    }];
  }
  return [];
}

function blueprintToMindmapProposal(
  blueprint: LessonAuthorBlueprint | null | undefined,
  appliedChapterIndexes: ReadonlySet<number> = new Set(),
): LessonAuthorProposal | null {
  if (!blueprint || !Array.isArray(blueprint.chapters) || blueprint.chapters.length === 0) return null;
  return {
    summary: blueprint.summary,
    // A succeeded job has already materialized this chapter in the course
    // outline. Re-applying the Blueprint as a proposal would incorrectly turn
    // those existing nodes into "planned update" nodes in the mind map.
    chapters: blueprint.chapters.flatMap((chapter, chapterIndex) => {
      if (appliedChapterIndexes.has(chapterIndex)) return [];
      return [{
        title: chapter.title || getFallbackStructureTitle('chapter', chapterIndex),
        lessons: (chapter.lessons ?? []).map((lesson, lessonIndex) => ({
        title: lesson.title || getFallbackStructureTitle('sequential', lessonIndex),
        // Older persisted Blueprints only have approved learning activities.
        // Render those activities as legacy units, but never invent component
        // nodes that were not reviewed in the original Blueprint.
        units: ((lesson.units?.length ?? 0) > 0
          ? lesson.units
          : (lesson.learning_activities ?? []).map((title) => ({
            title,
            source_refs: [],
            component_plan: [],
          }))
        ).map((unit, unitIndex) => ({
          title: unit.title || getFallbackStructureTitle('vertical', unitIndex),
          source_refs: unit.source_refs,
          components: (unit.component_plan ?? []).map((plan, componentIndex) => ({
            type: plan.type,
            title: plan.title || `${getComponentTypeLabel(plan.type)} ${componentIndex + 1}`,
            metadata: {
              component_selection_rationale: plan.rationale,
              source_refs: unit.source_refs,
              blueprint_planned: true,
            },
          })),
        })),
        })),
      }];
    }),
  };
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
    const chapterTitle = chapter.title || getFallbackStructureTitle('chapter', chapterIndex);
    const chapterNode = findChildByTitle(next, chapterTitle, 'chapter')
      ?? makePlannedNode(`planned-chapter-${chapterIndex}`, chapterTitle, 'chapter');
    if (!next.children.includes(chapterNode)) next.children.push(chapterNode);
    else markPlannedUpdate(chapterNode);

    const lessons = Array.isArray(chapter.lessons) ? chapter.lessons : [];
    lessons.forEach((lesson, lessonIndex) => {
      const lessonTitle = lesson.title || getFallbackStructureTitle('sequential', lessonIndex);
      const lessonNode = findChildByTitle(chapterNode, lessonTitle, 'sequential')
        ?? makePlannedNode(`planned-lesson-${chapterIndex}-${lessonIndex}`, lessonTitle, 'sequential');
      if (!chapterNode.children.includes(lessonNode)) chapterNode.children.push(lessonNode);
      else markPlannedUpdate(lessonNode);

      const units = Array.isArray(lesson.units) ? lesson.units : [];
      units.forEach((unit, unitIndex) => {
        const unitTitle = unit.title || getFallbackStructureTitle('vertical', unitIndex);
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

function markExistingSubtree(node: MindmapNode) {
  node.status = 'existing';
  node.children.forEach(markExistingSubtree);
}

function normalizeAppliedBlueprintChapters(
  root: MindmapNode,
  blueprint: LessonAuthorBlueprint | null | undefined,
  appliedChapterIndexes: ReadonlySet<number>,
): MindmapNode {
  if (!blueprint || appliedChapterIndexes.size === 0) return root;

  const next = cloneNode(root);
  for (const chapterIndex of appliedChapterIndexes) {
    const chapter = blueprint.chapters[chapterIndex];
    if (!chapter) continue;
    const chapterNode = findChildByTitle(
      next,
      chapter.title || getFallbackStructureTitle('chapter', chapterIndex),
      'chapter',
    );
    if (chapterNode) markExistingSubtree(chapterNode);
  }
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

function createEmptyRoot(
  proposalEvent: LessonAuthorProposalEvent | null,
  blueprintEvent: LessonAuthorBlueprintEvent | null | undefined,
): MindmapNode {
  return {
    id: blueprintEvent?.blueprint_id
      ? `blueprint-${blueprintEvent.blueprint_id}`
      : proposalEvent?.job_id
        ? `proposal-${proposalEvent.job_id}`
        : 'lesson-author-proposal',
    title: blueprintEvent?.blueprint.title || i18n.t('mindmap.courseOutline'),
    label: i18n.t('mindmap.course'),
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
  // Show course chapters immediately, then let the author reveal the dense
  // unit/component branches deliberately instead of opening a huge graph.
  return root.children.length > 0 ? new Set([root.id]) : new Set();
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
  blueprintEvent = null,
  loading = false,
  error = null,
}: LessonAuthorMindmapModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <LessonAuthorMindmapPanel
          outline={outline}
          proposalEvent={proposalEvent}
          blueprintEvent={blueprintEvent}
          loading={loading}
          error={error}
        />
      )}
    </Dialog>
  );
}

export function LessonAuthorMindmapPanel({
  outline,
  proposalEvent,
  blueprintEvent = null,
  loading = false,
  error = null,
  embedded = false,
}: LessonAuthorMindmapPanelProps) {
  const { t, i18n: translationInstance } = useTranslation();
  const locale = translationInstance.language;
  const isVietnamese = locale !== 'en';
  const isBlueprint = Boolean(blueprintEvent);
  const appliedBlueprintChapterIndexes = useMemo(() => new Set(
    (blueprintEvent?.applied_chapter_indexes ?? []).filter(index => (
      Number.isInteger(index)
      && index >= 0
      && index < (blueprintEvent?.blueprint.chapters.length ?? 0)
    )),
  ), [blueprintEvent]);
  const blueprintProposal = useMemo(
    () => blueprintToMindmapProposal(
      blueprintEvent?.blueprint,
      // Without an actual outline there is no persisted node to render as
      // existing, so retain the Blueprint as a reference-only fallback.
      outline?.course_structure ? appliedBlueprintChapterIndexes : new Set(),
    ),
    [appliedBlueprintChapterIndexes, blueprintEvent, outline],
  );
  const activeProposalEvent = useMemo(() => {
    if (!proposalEvent) return null;
    if (
      proposalEvent.blueprint_id
      && proposalEvent.blueprint_id === blueprintEvent?.blueprint_id
      && proposalEvent.blueprint_chapter_index !== undefined
      && appliedBlueprintChapterIndexes.has(proposalEvent.blueprint_chapter_index)
    ) {
      return null;
    }
    return proposalEvent;
  }, [appliedBlueprintChapterIndexes, blueprintEvent?.blueprint_id, proposalEvent]);
  const root = useMemo(() => {
    void locale;
    const baseRoot = outline?.course_structure
      ? outlineToMindmapNode(outline.course_structure)
      : createEmptyRoot(activeProposalEvent, blueprintEvent);
    const withBlueprint = mergeProposal(baseRoot, blueprintProposal);
    const withPendingProposal = mergeProposal(withBlueprint, activeProposalEvent?.proposal);
    // Once a chapter is applied, the persisted course outline is authoritative.
    // This also neutralizes an old proposal that arrives after the apply response.
    return normalizeAppliedBlueprintChapters(
      withPendingProposal,
      blueprintEvent?.blueprint,
      appliedBlueprintChapterIndexes,
    );
  }, [activeProposalEvent, appliedBlueprintChapterIndexes, blueprintEvent, blueprintProposal, locale, outline]);

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

  const modalHeader = (
    <DialogHeader className="border-b bg-card px-4 py-3.5 pr-12 sm:px-5 sm:py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary shadow-sm">
          <Network className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <DialogTitle className="text-base font-semibold">
            {isBlueprint
              ? (isVietnamese ? 'Mind map Bản thiết kế khóa học' : 'Course blueprint mind map')
              : (isVietnamese ? 'Thay đổi outline đề xuất' : 'Proposed outline changes')}
          </DialogTitle>
          <DialogDescription className="mt-1 line-clamp-2">
            {isBlueprint
              ? (isVietnamese
                ? 'Khung chương trình để rà soát trước khi soạn nội dung chi tiết.'
                : 'A curriculum framework to review before drafting detailed content.')
              : (isVietnamese
                ? 'So sánh outline hiện tại với các nội dung sẽ được tạo hoặc cập nhật sau khi duyệt.'
                : 'Compare the current outline with content that will be created or updated after approval.')}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
  const body = (
    <div className={embedded
      ? 'relative min-h-0 flex-1 bg-background'
      : 'grid min-h-0 flex-1 grid-cols-1 bg-muted/15 lg:grid-cols-[304px_minmax(0,1fr)]'}
    >
      {!embedded && (
          <aside className="border-b bg-card p-3.5 lg:border-b-0 lg:border-r lg:p-4">
            <div className="space-y-4">
              <div className="rounded-lg border border-border/80 bg-background p-3 shadow-sm">
                <div>
                  <p className="text-sm font-semibold">{isBlueprint ? (isVietnamese ? 'Tóm tắt Blueprint' : 'Blueprint summary') : t('mindmap.planSummary')}</p>
                </div>
                <p className="mt-2 line-clamp-4 text-xs leading-5 text-muted-foreground">
                  {blueprintEvent?.blueprint.summary || proposalEvent?.proposal.summary || t('mindmap.noProposal')}
                </p>
              </div>

              {blueprintEvent && (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{isVietnamese ? 'Chất lượng thiết kế' : 'Design quality'}</p>
                    <Badge variant="outline" className="rounded-md bg-background text-[10px]">
                      {blueprintEvent.quality_report.score}/100
                    </Badge>
                  </div>
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    {blueprintEvent.quality_report.status === 'ready_for_review'
                      ? (isVietnamese ? 'Sẵn sàng để rà soát và chọn chương cần soạn chi tiết.' : 'Ready for review and chapter-level drafting.')
                      : (isVietnamese ? 'Cần xác nhận một số điểm trước khi chuyển sang soạn chi tiết.' : 'Some items need confirmation before detailed drafting.')}
                  </p>
                  {blueprintEvent.quality_report.review_notes.slice(0, 3).map((note, index) => (
                    <p key={`${note}-${index}`} className="border-l-2 border-primary/35 pl-2 text-[11px] leading-4 text-muted-foreground">{note}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <StatTile label={t('mindmap.totalNodes')} value={totalNodes} />
                <StatTile label={t('mindmap.existing')} value={stats.existing} />
                <StatTile label={t('mindmap.createNew')} value={stats.created} accent="text-emerald-600 dark:text-emerald-300" />
                <StatTile label={t('mindmap.update')} value={stats.updated} accent="text-amber-600 dark:text-amber-300" />
                <StatTile label={t('mindmap.component')} value={stats.components} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('mindmap.legend')}</p>
                <LegendItem status="existing" />
                <LegendItem status="planned-create" />
                <LegendItem status="planned-update" />
              </div>
            </div>
          </aside>
      )}

          <main className={`relative min-h-0 overflow-hidden bg-background ${embedded ? 'h-full' : ''}`}>
            {loading ? (
              <LoadingMindmap />
            ) : error ? (
              <div className="flex min-h-[360px] items-center justify-center">
                <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                  <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
                  <p className="mt-3 text-sm font-semibold">{t('mindmap.loadFailed')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{error}</p>
                </div>
              </div>
            ) : (
              <div className={`h-full w-full ${embedded ? 'min-h-0' : 'min-h-[440px]'}`}>
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
                    style={{ backgroundColor: 'hsl(var(--background))' }}
                  >
                    <Controls
                      showInteractive={false}
                      className="!bottom-3 !left-3 !overflow-hidden !rounded-lg !border !border-border !bg-card !shadow-lg [&>button]:!flex [&>button]:!h-9 [&>button]:!w-9 [&>button]:!items-center [&>button]:!justify-center [&>button]:!border-b [&>button]:!border-border/70 [&>button]:!bg-card [&>button]:!text-foreground [&>button:hover]:!bg-muted [&>button:last-child]:!border-b-0 [&>button>svg]:!fill-none [&>button>svg]:!text-foreground"
                    />
                    {!embedded && (
                      <MiniMap
                        pannable
                        zoomable
                        className="!border !border-border !bg-card !shadow-lg"
                        nodeStrokeWidth={3}
                        nodeColor={(node) => edgeColor[(node.data?.status as MindmapStatus) ?? 'existing']}
                      />
                    )}
                    <Background gap={18} size={1} color="hsl(var(--muted-foreground) / 0.18)" />
                  </ReactFlow>
                </ReactFlowProvider>
              </div>
            )}
          </main>
    </div>
  );

  if (embedded) return <div className="flex h-full min-h-0 flex-col overflow-hidden">{body}</div>;

  return (
    <DialogContent
      overlayClassName="z-[10040]"
      className="z-[10050] flex h-[calc(100dvh-16px)] max-h-[880px] w-[calc(100vw-16px)] max-w-[1360px] flex-col gap-0 overflow-hidden rounded-lg border-border/80 bg-background p-0 shadow-2xl"
    >
      {modalHeader}
      {body}
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
      <span className="text-muted-foreground">{getStatusLabel(status)}</span>
    </div>
  );
}

function MindmapFlowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as MindmapFlowNodeData;
  const { t, i18n: translationInstance } = useTranslation();
  const Icon = getComponentIcon(nodeData.blockType);
  const displayLabel = resolveMindmapNodeLabel(nodeData.label, nodeData.blockType, t, translationInstance.language);
  const isChanged = nodeData.status !== 'existing';
  return (
    <div
      className={`group relative w-[242px] overflow-hidden rounded-lg border shadow-md transition-shadow duration-200 ${
        nodeShellClassName[nodeData.status]
      } ${
        selected ? 'ring-2 ring-primary/35 shadow-xl' : 'hover:shadow-lg'
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background/80 text-current ring-1 ring-current/10">
            {isChanged ? <RefreshCw className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="h-5 rounded-md bg-background/70 px-1.5 text-[10px]">
                {displayLabel}
              </Badge>
              <Badge variant="secondary" className="h-5 rounded-md bg-background/70 px-1.5 text-[10px]">
                {getStatusLabel(nodeData.status)}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground">
              {nodeData.title}
            </p>
            {nodeData.collapsible && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {nodeData.expanded
                  ? i18n.t('mindmap.itemsExpanded', { count: nodeData.childCount })
                  : i18n.t('mindmap.childItems', { count: nodeData.childCount })}
              </p>
            )}
          </div>
          {nodeData.collapsible && (
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground ring-1 ring-current/10 transition-colors group-hover:text-foreground">
              {nodeData.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
