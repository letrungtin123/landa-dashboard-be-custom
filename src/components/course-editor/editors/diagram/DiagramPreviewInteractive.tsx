import React, { useMemo, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Node,
  useNodesState,
  useEdgesState,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import CustomShapeNode, { type DiagramNodeData } from './CustomShapeNode';
import JunctionNode from './JunctionNode';
import OrthogonalEdge from './OrthogonalEdge';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { normalizeDiagramData, normalizeDiagramEdges } from './diagram-data';
import {
  edgeAppearanceToMarkerEnd,
  edgeAppearanceToStyle,
  getEdgeAppearance,
} from './edge-appearance';

const nodeTypes = {
  customShape: CustomShapeNode,
  junction: JunctionNode,
};

const edgeTypes = {
  orthogonal: OrthogonalEdge,
};

const EMPTY_DIAGRAM: Diagram = { id: '', name: '', nodes: [], edges: [] };

function normalizePreviewEdges(edges: any[], nodes: Node[]) {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const seen = new Set<string>();

  return normalizeDiagramEdges(edges, nodes)
    .filter(edge => {
      const source = String(edge?.source ?? '');
      const target = String(edge?.target ?? '');
      if (!source || !target || source === target || !nodesById.has(source) || !nodesById.has(target)) return false;
      const key = `${source}->${target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((edge, index) => {
      const routing = edge.data?.routing === 'feedback' ? 'feedback' : 'orthogonal';
      const appearance = getEdgeAppearance(edge, routing);
      return {
        ...edge,
        id: edge.id || `diagram-edge-${index + 1}`,
        animated: false,
        type: 'orthogonal' as const,
        markerEnd: edgeAppearanceToMarkerEnd(appearance),
        style: edgeAppearanceToStyle(appearance, {
          ...(edge.style ?? {}),
          strokeWidth: routing === 'feedback' ? 2 : 1.75,
          opacity: 0.9,
        }),
      };
    });
}

export interface Diagram {
  id: string;
  name: string;
  nodes: Node<DiagramNodeData>[];
  edges: any[];
}

interface DiagramPreviewInteractiveProps {
  data: {
    display_name?: string;
    diagrams?: Diagram[];
    start_diagram_id?: string;
  };
}

export default function DiagramPreviewInteractive({ data }: DiagramPreviewInteractiveProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  // `ComponentPreview` may resolve the same database payload into a new
  // object on every parent render. Keep the React Flow inputs referentially
  // stable; otherwise the sync effect below writes state on every render and
  // React eventually throws error #185 (maximum update depth exceeded).
  const dataFingerprint = useMemo(() => JSON.stringify(data), [data]);
  const normalizedData = useMemo(
    () => normalizeDiagramData(data),
    [dataFingerprint],
  );
  const diagrams = normalizedData?.diagrams || [];
  const startDiagramId = normalizedData?.start_diagram_id || (diagrams.length > 0 ? diagrams[0].id : null);

  const [history, setHistory] = useState<string[]>(startDiagramId ? [startDiagramId] : []);
  
  const currentDiagramId = history.length > 0 ? history[history.length - 1] : startDiagramId;
  const activeDiagram = diagrams.find((d) => d.id === currentDiagramId);
  const previewDiagram: Diagram = activeDiagram ?? EMPTY_DIAGRAM;

  const handleNodeClick = (event: React.MouseEvent, node: Node) => {
    const targetId = (node.data as any)?.target_diagram_id;
    if (targetId && diagrams.some((d) => d.id === targetId)) {
      setHistory((prev) => [...prev, targetId]);
    }
  };

  const goBack = () => {
    if (history.length > 1) {
      setHistory((prev) => prev.slice(0, -1));
    }
  };

  const initialNodes = useMemo(() => previewDiagram.nodes.map((n) => ({
    ...n,
    draggable: false,
    selectable: false,
    connectable: false,
    data: { ...n.data, hidePorts: true },
  })), [previewDiagram]);

  const initialEdges = useMemo(
    () => normalizePreviewEdges(previewDiagram.edges, initialNodes),
    [initialNodes, previewDiagram.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Reset navigation when the component is reused for a different diagram
  // block while the unit editor remains mounted.
  React.useEffect(() => {
    setHistory(startDiagramId ? [startDiagramId] : []);
  }, [dataFingerprint, startDiagramId]);

  // Sync state if activeDiagram's nodes/edges change
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialEdges, initialNodes, setNodes, setEdges]);

  if (!activeDiagram) {
    return (
      <div className="flex flex-col items-center justify-center p-12 rounded-xl border-2 border-dashed border-border text-muted-foreground text-sm">
        {t('courseEditorForms.noDiagramData')}
      </div>
    );
  }

  return (
    <div className="w-full min-h-[400px] flex flex-col border border-border rounded-xl overflow-hidden bg-background">
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-3">
          {history.length > 1 && (
            <Button variant="outline" size="sm" onClick={goBack} className="h-8 gap-1 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> {t('courseEditorForms.back')}
            </Button>
          )}
          <h3 className="font-semibold text-primary">{activeDiagram.name}</h3>
        </div>
      </div>
      <div className="diagram-preview-flow w-full relative" style={{ height: '400px' }}>
        <ReactFlow
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          colorMode={theme === 'dark' ? 'dark' : 'light'}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          onNodeClick={handleNodeClick}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          panOnDrag={true}
        >
          <Controls showInteractive={false} />
          <MiniMap />
          <Background gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
