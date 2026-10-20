import type { CSSProperties, ReactNode } from 'react';
import { BaseEdge, Handle, Position, getSmoothStepPath, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { WorkspaceLocale, WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import { workspaceCopy } from './workspace-node-detail';
import type { WorkspaceProjectionNode } from './workspace-graph.logic';
import {
  getWorkspaceNodeVisual, nodeAccentClassName, nodeShellClassName, statusClassName, workspaceBuildAccent,
  workspaceMindmapStatus, workspaceNodeTypeLabel,
} from './workspace-node-visual';
import { WorkspaceBuildBeacon } from './workspace-build-beacon';

export type FlowData = Record<string, unknown> & WorkspaceProjectionNode & {
  locale: WorkspaceLocale; onExpand: (id: string, expanded: boolean) => void;
  /** The run has ended: planned/generating nodes are no longer being built. */
  runEnded?: boolean;
  /** Optional owner action on a committed card (rewrite a lesson without content). */
  renderAction?: (node: WorkspaceNode) => ReactNode;
};
export type FlowNode = Node<FlowData, 'workspace'>;
type WorkspaceBuildEdgeData = Record<string, unknown> & {
  active: boolean;
  color: string;
  delaySeconds: number;
};
export type WorkspaceBuildEdge = Edge<WorkspaceBuildEdgeData, 'workspaceBuild'>;

/** Shared by the graph card and detail header so type copy and Apply-state
 * color cannot drift between the two presentations. */
export function WorkspaceNodeTypePill({ node, locale }: { node: WorkspaceNode; locale: WorkspaceLocale }) {
  const status = workspaceMindmapStatus(node);
  return <Badge variant="outline" className={`h-5 rounded-full px-2 text-[10px] font-semibold ${statusClassName[status]}`}>
    {workspaceNodeTypeLabel(node, locale)}
  </Badge>;
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
  const { node, locale, childCount, expanded, onExpand, preview, previewState, runEnded = false, renderAction } = data;
  const action = preview ? null : renderAction?.(node) ?? null;
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
    {action && <div className="absolute bottom-2 right-2 z-10">{action}</div>}
  </div>;
}
/** Module-level so React Flow always receives the same node and edge type maps. */
export const workspaceFlowNodeTypes = { workspace: WorkspaceGraphNode };
export const workspaceFlowEdgeTypes = { workspaceBuild: WorkspaceFlowBuildEdge };
