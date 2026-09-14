export type DiagramDataLike = {
  diagrams: Array<{
    id: string;
    name: string;
    nodes: any[];
    edges: any[];
    [key: string]: any;
  }>;
  start_diagram_id: string;
  [key: string]: any;
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function unwrap(value: unknown): unknown {
  let current = parseMaybeJson(value);
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current) || !('diagram_data' in current)) return current;
    current = parseMaybeJson(current.diagram_data);
  }
  return current;
}

export function normalizeDiagramData(value: unknown): DiagramDataLike | null {
  const raw = unwrap(value);
  if (!isRecord(raw) || !Array.isArray(raw.diagrams)) return null;
  const diagrams = raw.diagrams
    .filter(isRecord)
    .map((diagram, diagramIndex) => ({
      ...diagram,
      id: String(diagram.id ?? `diagram-${diagramIndex + 1}`),
      name: String(diagram.name ?? `Sơ đồ ${diagramIndex + 1}`),
      nodes: Array.isArray(diagram.nodes) ? diagram.nodes : [],
      edges: Array.isArray(diagram.edges) ? diagram.edges : [],
    }));
  const start = String(raw.start_diagram_id ?? '');
  return {
    ...raw,
    diagrams,
    start_diagram_id: diagrams.some(diagram => diagram.id === start) ? start : (diagrams[0]?.id ?? ''),
  };
}

export function resolveDiagramData(blockInfo: any): DiagramDataLike | null {
  const candidates = [
    blockInfo?.metadata?.diagram_data,
    blockInfo?.data?.diagram_data,
    blockInfo?.data,
    blockInfo?.diagram_data,
    blockInfo?.published_metadata?.diagram_data,
    blockInfo?.published_data?.diagram_data,
    blockInfo?.published_data,
  ];
  let emptyFallback: DiagramDataLike | null = null;
  for (const candidate of candidates) {
    const normalized = normalizeDiagramData(candidate);
    if (!normalized) continue;
    if (normalized.diagrams.length > 0) return normalized;
    emptyFallback ??= normalized;
  }
  return emptyFallback;
}

function normalizedHandle(value: unknown, nodeType: string, role: 'source' | 'target'): string | undefined {
  if (typeof value !== 'string') return undefined;
  const base = value.trim().toLowerCase().replace(/-(?:source|target)$/, '');
  if (!['top', 'left', 'bottom', 'right'].includes(base)) return undefined;
  if (nodeType !== 'junction') return base;
  const allowed = role === 'source' ? ['bottom', 'right'] : ['top', 'left'];
  return allowed.includes(base) ? `${base}-${role}` : undefined;
}

function getFallbackHandles(source: any, target: any) {
  const dx = Number(target?.position?.x ?? 0) - Number(source?.position?.x ?? 0);
  const dy = Number(target?.position?.y ?? 0) - Number(source?.position?.y ?? 0);
  const sourcePosition = Math.abs(dx) >= Math.abs(dy)
    ? (dx >= 0 ? 'right' : 'left')
    : (dy >= 0 ? 'bottom' : 'top');
  const targetPosition = sourcePosition === 'right'
    ? 'left'
    : sourcePosition === 'left'
      ? 'right'
      : sourcePosition === 'bottom'
        ? 'top'
        : 'bottom';
  const sourceType = source?.type ?? 'customShape';
  const targetType = target?.type ?? 'customShape';
  const safeSourcePosition = sourceType === 'junction' && !['bottom', 'right'].includes(sourcePosition)
    ? 'right'
    : sourcePosition;
  const safeTargetPosition = targetType === 'junction' && !['top', 'left'].includes(targetPosition)
    ? 'top'
    : targetPosition;
  return {
    sourceHandle: normalizedHandle(safeSourcePosition, sourceType, 'source'),
    targetHandle: normalizedHandle(safeTargetPosition, targetType, 'target'),
  };
}

export function normalizeDiagramEdges(edges: any[], nodes: any[]): any[] {
  const nodesById = new Map(nodes.map(node => [String(node?.id ?? ''), node]));
  return (Array.isArray(edges) ? edges : [])
    .map((edge, index) => {
      const source = nodesById.get(String(edge?.source ?? ''));
      const target = nodesById.get(String(edge?.target ?? ''));
      if (!edge || !source || !target || source.id === target.id) return null;
      const fallback = getFallbackHandles(source, target);
      return {
        ...edge,
        id: String(edge.id ?? `diagram-edge-${index + 1}`),
        sourceHandle: normalizedHandle(edge.sourceHandle, source.type ?? 'customShape', 'source') ?? fallback.sourceHandle,
        targetHandle: normalizedHandle(edge.targetHandle, target.type ?? 'customShape', 'target') ?? fallback.targetHandle,
      };
    })
    .filter(Boolean);
}
