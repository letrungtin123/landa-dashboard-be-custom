import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  type EdgeProps,
} from '@xyflow/react';
import { getDiagramEdgeRoute } from './edge-routing';
import {
  edgeAppearanceToStyle,
  getEdgeAppearance,
} from './edge-appearance';

/**
 * Keep diagram relationships on a predictable orthogonal route. The larger
 * offset prevents the line from visually touching the node border, while the
 * rounded corners keep branching diagrams readable without diagonal crossings.
 */
export default function OrthogonalEdge({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, style, markerEnd, label, data, interactionWidth,
}: EdgeProps) {
  const routing = (data as { routing?: unknown } | undefined)?.routing === 'feedback'
    ? 'feedback'
    : 'orthogonal';
  const [edgePath, labelX, labelY] = getDiagramEdgeRoute({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    routing,
    feedbackSide: 'right',
  });
  const appearance = getEdgeAppearance({ data, style, markerEnd }, routing);

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={appearance.arrow === 'end' ? (markerEnd ?? MarkerType.ArrowClosed) : undefined}
        interactionWidth={Math.min(interactionWidth ?? 20, 12)}
        style={edgeAppearanceToStyle(appearance, {
          ...style,
          strokeWidth: routing === 'feedback' ? 2 : 1.75,
          opacity: 0.9,
        })}
      />
      {routing === 'feedback' && label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none rounded-md border border-primary/30 bg-background/95 px-2 py-1 text-[10px] font-medium text-primary shadow-sm"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
