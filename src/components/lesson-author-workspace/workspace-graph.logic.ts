import type {
  WorkspaceArchitecturePreview, WorkspaceArchitecturePreviewState, WorkspaceGraph, WorkspaceNode, WorkspaceStatus,
} from '../../api/lesson-author-workspace.contract';

/** Pure mind map projection of the committed graph and the durable planning
 * preview: layout, expansion, progressive reveal, Overview counts and the
 * bounded live-build set. No React and no I/O. */

export type WorkspaceExpansion = Readonly<Record<string, boolean>>;
export interface WorkspaceProjectionNode {
  node: WorkspaceNode;
  position: { x: number; y: number };
  childCount: number;
  expanded: boolean;
  /** Presentation-only progress nodes never grant detail/edit/apply authority. */
  preview: boolean;
  previewState: WorkspaceArchitecturePreviewState | null;
}

export interface WorkspacePresentationNode {
  node: WorkspaceNode;
  preview: boolean;
  previewState: WorkspaceArchitecturePreviewState | null;
}

function layoutWorkspaceNodes(nodes: readonly WorkspacePresentationNode[], expansion: WorkspaceExpansion): WorkspaceProjectionNode[] {
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
export function projectWorkspaceGraph(graph: WorkspaceGraph | null, expansion: WorkspaceExpansion = {}): WorkspaceProjectionNode[] {
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
  expansion: WorkspaceExpansion = {},
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
export function collapseWorkspaceToChapterLevel(graph: WorkspaceGraph | null): WorkspaceExpansion {
  if (!graph) return {};
  const expandable = new Set(graph.nodes.map(node => node.parent_id).filter((id): id is string => id !== null));
  const courses = new Set(graph.nodes.filter(node => node.kind === 'course').map(node => node.node_id));
  return Object.fromEntries([...expandable].map(id => [id, courses.has(id)]));
}

/** Collapse a branch as one state transition. Descendant expansion flags must
 * not survive invisibly: otherwise reopening a parent remounts the whole old
 * subtree at once and produces a large, disorienting layout jump. */
export function collapseWorkspaceBranch(graph: WorkspaceGraph | null, expansion: WorkspaceExpansion, nodeId: string): WorkspaceExpansion {
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

export function collapsePresentationBranch(nodes: readonly WorkspacePresentationNode[], expansion: WorkspaceExpansion, nodeId: string): WorkspaceExpansion {
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

export function collapsePresentationToChapterLevel(nodes: readonly WorkspacePresentationNode[]): WorkspaceExpansion {
  const expandable = new Set(nodes.map(item => item.node.parent_id).filter((id): id is string => id !== null));
  const courses = new Set(nodes.filter(item => item.node.kind === 'course').map(item => item.node.node_id));
  return Object.fromEntries([...expandable].map(id => [id, courses.has(id)]));
}

/** Choose the initial tree mode once per modal open. Active runs stay open so
 * committed units appear live; reopening a terminal run starts at the useful
 * course + chapter index instead of rendering the complete tree at once. */
export function initialWorkspaceExpansion(graph: WorkspaceGraph | null, status: WorkspaceStatus | null): WorkspaceExpansion | null {
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

export const maxAnimatedWorkspaceEdges = 8;

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
