import {
  getSmoothStepPath,
  getStraightPath,
  type Position,
} from '@xyflow/react';

export type DiagramEdgeRouting = 'orthogonal' | 'feedback';

type DiagramEdgeRouteInput = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  routing?: DiagramEdgeRouting;
  feedbackSide?: 'left' | 'right';
};

export function getDiagramEdgeRoute({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  routing = 'orthogonal',
  feedbackSide = 'right',
}: DiagramEdgeRouteInput): [string, number, number, ...number[]] {
  if (routing === 'feedback') {
    const side = feedbackSide === 'left' ? -1 : 1;
    const outerX = side > 0
      ? Math.max(sourceX, targetX) + 64
      : Math.min(sourceX, targetX) - 64;
    const radius = 12;
    const verticalDirection = targetY >= sourceY ? 1 : -1;
    const path = [
      `M ${sourceX} ${sourceY}`,
      `L ${outerX - side * radius} ${sourceY}`,
      `Q ${outerX} ${sourceY} ${outerX} ${sourceY + verticalDirection * radius}`,
      `L ${outerX} ${targetY - verticalDirection * radius}`,
      `Q ${outerX} ${targetY} ${outerX - side * radius} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(' ');
    return [path, outerX + side * 10, (sourceY + targetY) / 2];
  }

  const isVertical = Math.abs(sourceX - targetX) < 1
    && sourcePosition !== targetPosition
    && ['top', 'bottom'].includes(sourcePosition)
    && ['top', 'bottom'].includes(targetPosition);
  const isHorizontal = Math.abs(sourceY - targetY) < 1
    && sourcePosition !== targetPosition
    && ['left', 'right'].includes(sourcePosition)
    && ['left', 'right'].includes(targetPosition);

  if (isVertical || isHorizontal) {
    return getStraightPath({ sourceX, sourceY, targetX, targetY });
  }

  return getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    offset: 22,
  });
}
