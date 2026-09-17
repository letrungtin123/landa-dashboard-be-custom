import type { CSSProperties } from 'react';

export type DiagramEdgeLineStyle = 'solid' | 'dashed';
export type DiagramEdgeArrow = 'none' | 'end';

export type DiagramEdgeAppearance = {
  lineStyle: DiagramEdgeLineStyle;
  arrow: DiagramEdgeArrow;
  color: string;
};

export const EDGE_COLOR_SWATCHES = [
  '#64748B',
  '#2563EB',
  '#0891B2',
  '#16A34A',
  '#D97706',
  '#DC2626',
  '#9333EA',
] as const;

const DEFAULT_EDGE_COLOR = '#64748B';
const DEFAULT_FEEDBACK_EDGE_COLOR = '#2563EB';

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeEdgeColor(value: unknown, fallback = DEFAULT_EDGE_COLOR): string {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : fallback;
}

function normalizeLineStyle(value: unknown, fallback: DiagramEdgeLineStyle): DiagramEdgeLineStyle {
  return value === 'dashed' || value === 'solid' ? value : fallback;
}

function normalizeArrow(value: unknown, fallback: DiagramEdgeArrow): DiagramEdgeArrow {
  return value === 'none' || value === 'end' ? value : fallback;
}

/**
 * Read the persisted appearance first, then infer a compatible default for
 * legacy edges that only contain React Flow style/marker fields.
 */
export function getEdgeAppearance(
  edge: { data?: unknown; style?: CSSProperties; markerEnd?: unknown } | null | undefined,
  routing?: unknown,
): DiagramEdgeAppearance {
  const data = isRecord(edge?.data) ? edge.data : {};
  const persisted = isRecord(data.appearance) ? data.appearance : {};
  const effectiveRouting = routing ?? data.routing;
  const inferredLineStyle = typeof edge?.style?.strokeDasharray === 'string'
    && edge.style.strokeDasharray.trim().length > 0
    ? 'dashed'
    : effectiveRouting === 'feedback' ? 'dashed' : 'solid';
  const hasExplicitMarker = Boolean(edge && Object.prototype.hasOwnProperty.call(edge, 'markerEnd'));
  const inferredArrow: DiagramEdgeArrow = hasExplicitMarker && (edge?.markerEnd === null || edge?.markerEnd === false)
    ? 'none'
    : 'end';
  const markerColor = isRecord(edge?.markerEnd) ? edge.markerEnd.color : undefined;
  const fallbackColor = effectiveRouting === 'feedback' ? DEFAULT_FEEDBACK_EDGE_COLOR : DEFAULT_EDGE_COLOR;

  return {
    lineStyle: normalizeLineStyle(persisted.lineStyle, inferredLineStyle),
    arrow: normalizeArrow(persisted.arrow, inferredArrow),
    color: normalizeEdgeColor(
      persisted.color ?? edge?.style?.stroke ?? markerColor,
      fallbackColor,
    ),
  };
}

export function edgeAppearanceToStyle(
  appearance: DiagramEdgeAppearance,
  baseStyle?: CSSProperties,
): CSSProperties {
  return {
    ...baseStyle,
    stroke: appearance.color,
    strokeDasharray: appearance.lineStyle === 'dashed' ? '6 4' : undefined,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
}

export function edgeAppearanceToMarkerEnd(
  appearance: DiagramEdgeAppearance,
): { type: 'arrowclosed'; color: string; width: number; height: number } | undefined {
  if (appearance.arrow === 'none') return undefined;
  return {
    type: 'arrowclosed',
    color: appearance.color,
    width: 12,
    height: 12,
  };
}

export function withEdgeAppearance(
  edge: Record<string, any>,
  patch: Partial<DiagramEdgeAppearance>,
  routing?: unknown,
): Record<string, any> {
  const appearance = { ...getEdgeAppearance(edge, routing), ...patch };
  return {
    ...edge,
    style: edgeAppearanceToStyle(appearance, isRecord(edge.style) ? edge.style : undefined),
    markerStart: undefined,
    markerEnd: edgeAppearanceToMarkerEnd(appearance),
    data: {
      ...(isRecord(edge.data) ? edge.data : {}),
      appearance,
    },
  };
}
