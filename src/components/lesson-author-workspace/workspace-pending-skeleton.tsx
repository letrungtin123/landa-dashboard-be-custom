import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { Blocks, BookOpenCheck, GitBranch, ListTree } from 'lucide-react';
import type { WorkspaceLocale } from '../../api/lesson-author-workspace.contract';
import { WorkspaceCourseOverviewSkeleton, workspaceCopy } from './workspace-node-detail';
import { getWorkspaceNodeVisual } from './workspace-node-visual';
import { WorkspaceBuildBeacon } from './workspace-build-beacon';

const pendingOverviewMetrics = (locale: WorkspaceLocale) => {
  const c = workspaceCopy[locale];
  return [
    { label: c.chapterCount, icon: GitBranch, accent: '#3b82f6', tone: 'text-primary bg-primary/10 border-primary/20' },
    { label: c.sectionCount, icon: ListTree, accent: '#8b5cf6', tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20 dark:text-violet-300' },
    { label: c.lessonCount, icon: BookOpenCheck, accent: '#10b981', tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300' },
    { label: c.interactiveCount, icon: Blocks, accent: '#f59e0b', tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300' },
  ] as const;
};

const pendingNodeTone = {
  course: 'border-blue-500/30 bg-blue-500/[0.08] text-blue-500 shadow-blue-950/10 dark:text-blue-300',
  chapter: 'border-violet-500/30 bg-violet-500/[0.08] text-violet-500 shadow-violet-950/10 dark:text-violet-300',
  lesson: 'border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-600 shadow-cyan-950/10 dark:text-cyan-300',
  unit: 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-600 shadow-emerald-950/10 dark:text-emerald-300',
  component: 'border-amber-500/30 bg-amber-500/[0.08] text-amber-600 shadow-amber-950/10 dark:text-amber-300',
} as const;

const pendingNodeAccent: Record<keyof typeof pendingNodeTone, string> = {
  course: '#3b82f6', chapter: '#8b5cf6', lesson: '#06b6d4', unit: '#10b981', component: '#f59e0b',
};

const pendingMindmapGeometry = {
  width: 1180,
  height: 560,
  nodeWidth: 244,
  nodeHeight: 118,
  nodes: [
    { id: 'course', kind: 'course', x: 48, y: 247 },
    { id: 'chapter-top', kind: 'chapter', x: 370, y: 112 },
    { id: 'chapter-bottom', kind: 'chapter', x: 370, y: 382 },
    { id: 'unit', kind: 'unit', x: 860, y: 74 },
    { id: 'lesson', kind: 'lesson', x: 860, y: 247 },
    { id: 'component', kind: 'component', x: 860, y: 420 },
  ],
} as const;

const pendingMindmapEdges = [
  { id: 'course-chapter-top', from: 'course', to: 'chapter-top' },
  { id: 'course-chapter-bottom', from: 'course', to: 'chapter-bottom' },
  { id: 'chapter-top-unit', from: 'chapter-top', to: 'unit' },
  { id: 'chapter-top-lesson', from: 'chapter-top', to: 'lesson' },
  { id: 'chapter-bottom-component', from: 'chapter-bottom', to: 'component' },
] as const;

function pendingMindmapEdgePath(fromId: string, toId: string) {
  const from = pendingMindmapGeometry.nodes.find(node => node.id === fromId)!;
  const to = pendingMindmapGeometry.nodes.find(node => node.id === toId)!;
  const startX = from.x + pendingMindmapGeometry.nodeWidth + 12;
  const startY = from.y + pendingMindmapGeometry.nodeHeight / 2;
  const endX = to.x - 16;
  const endY = to.y + pendingMindmapGeometry.nodeHeight / 2;
  if (startY === endY) return `M ${startX} ${startY} H ${endX}`;
  const middleX = Math.round(startX + (endX - startX) * 0.5);
  const directionY = endY > startY ? 1 : -1;
  const radius = Math.min(18, Math.abs(endY - startY) / 2, (endX - startX) / 4);
  return `M ${startX} ${startY} H ${middleX - radius} Q ${middleX} ${startY} ${middleX} ${startY + directionY * radius} V ${endY - directionY * radius} Q ${middleX} ${endY} ${middleX + radius} ${endY} H ${endX}`;
}

function PendingMindmapNode({ label, kind, x, y, delay = 0 }: {
  label: string; kind: keyof typeof pendingNodeTone; x: number; y: number; delay?: number;
}) {
  const { Icon } = getWorkspaceNodeVisual({ kind, component_type: null, media_type: null });
  return <motion.div initial={{ opacity: 0, scale: 0.96, x: -8 }} animate={{ opacity: 1, scale: 1, x: 0 }}
    transition={{ duration: 0.35, delay }}
    style={{ left: x, top: y, '--workspace-build-accent': pendingNodeAccent[kind] } as CSSProperties}
    data-workspace-building="true"
    className={`workspace-build-node absolute h-[118px] w-[244px] overflow-hidden rounded-2xl border bg-card/95 shadow-[0_18px_45px_-28px_currentColor] backdrop-blur-sm ${pendingNodeTone[kind]}`}>
    <div className="h-1 w-full bg-current opacity-80" />
    <div className="flex gap-3 p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/20 bg-background/75 shadow-sm"><Icon className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><span className="inline-flex rounded-full border border-current/20 bg-background/65 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em]">{label}</span>
          <WorkspaceBuildBeacon /></div>
        <div className="workspace-build-shimmer mt-3 space-y-2" aria-hidden><div className="h-3 w-11/12 rounded-full bg-current/[0.24] dark:bg-current/[0.17]" /><div className="h-3 w-7/12 rounded-full bg-current/[0.18] dark:bg-current/[0.12]" /></div>
      </div>
    </div>
  </motion.div>;
}

/** Product-shaped loading shell used before the first committed graph.
 * It deliberately renders no planning/provider data: content is shown only
 * after it belongs to the committed, interactive workspace graph. */
export function WorkspacePendingSkeleton({ locale, stage }: {
  locale: WorkspaceLocale; stage: 'overview' | 'mindmap';
}) {
  const c = workspaceCopy[locale];
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}
    className="h-full min-h-[320px] overflow-y-auto p-4 sm:p-5" role="status" aria-live="polite">
    <span className="sr-only">{stage === 'overview' ? c.emptyOverview : c.empty}</span>
    {stage === 'overview' ? <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{pendingOverviewMetrics(locale).map(item => { const Icon = item.icon; return <div key={item.label} className="workspace-build-card flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"
        style={{ '--workspace-build-accent': item.accent } as CSSProperties}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4.5 w-4.5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><div className="workspace-build-shimmer h-5 w-10 rounded bg-muted" aria-hidden /><p className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted-foreground">{item.label}</p></div>
      </div>; })}</div>
      <WorkspaceCourseOverviewSkeleton locale={locale} />
      <section className="workspace-build-card rounded-2xl border border-primary/20 bg-card p-4 shadow-sm"
        style={{ '--workspace-build-accent': '#3b82f6' } as CSSProperties}>
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><GitBranch className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{c.chapters}</p><div className="workspace-build-shimmer mt-2 h-4 w-48 max-w-[55vw] rounded bg-muted" aria-hidden /></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{[0, 1].map(index => <div key={index} className="rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">{c.chapter} {index + 1} · {c.outcomes}</p>
          <div className="workspace-build-shimmer mt-3 space-y-2" aria-hidden><div className="h-3 w-5/6 rounded bg-violet-500/15" /><div className="h-3 w-2/3 rounded bg-violet-500/10" /></div>
        </div>)}</div>
      </section>
    </div> : <div className="h-full w-full overflow-auto" aria-hidden>
      <div data-pending-mindmap-canvas className="relative mx-auto h-[560px] w-[1180px] overflow-hidden rounded-3xl border border-border/45 bg-background shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04),0_24px_70px_-55px_hsl(var(--primary))]"
        style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground) / 0.2) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_48%_45%,hsl(var(--primary)/0.08),transparent_38%),linear-gradient(to_bottom,hsl(var(--background)/0.2),hsl(var(--background)/0.78))]" />
        <div className="absolute left-1/2 top-5 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/20 bg-card/90 px-4 py-2 shadow-lg backdrop-blur-md">
          <WorkspaceBuildBeacon />
          <div><p className="text-xs font-semibold text-foreground">{c.buildingMap}</p><p className="text-[10px] text-muted-foreground">{c.buildingMapNote}</p></div>
        </div>
        {/* Cards and edges share one fixed logical coordinate system. Every
         * path terminates inside the canvas and immediately before its target,
         * so responsive scrolling cannot cut or detach an edge. */}
        <svg data-pending-edge-layer aria-hidden className="pointer-events-none absolute inset-0 h-full w-full text-primary"
          viewBox={`0 0 ${pendingMindmapGeometry.width} ${pendingMindmapGeometry.height}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="pending-map-edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
              <stop offset="0.55" stopColor="currentColor" stopOpacity="0.68" />
              <stop offset="1" stopColor="#38bdf8" stopOpacity="0.92" />
            </linearGradient>
            <marker id="pending-map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto">
              <path d="M 1 1 L 9 5 L 1 9 z" fill="#38bdf8" opacity="0.9" />
            </marker>
          </defs>
          {pendingMindmapEdges.map((edge, index) => <g key={edge.id} data-pending-edge={edge.id}>
            <path data-pending-edge-track d={pendingMindmapEdgePath(edge.from, edge.to)} fill="none" stroke="url(#pending-map-edge-gradient)"
              vectorEffect="non-scaling-stroke" strokeWidth="7" strokeLinecap="round" opacity="0.12" />
            <path d={pendingMindmapEdgePath(edge.from, edge.to)} fill="none" stroke="url(#pending-map-edge-gradient)"
              vectorEffect="non-scaling-stroke" strokeWidth="2.25" strokeLinecap="round" markerEnd="url(#pending-map-arrow)" />
            <path data-pending-edge-flow d={pendingMindmapEdgePath(edge.from, edge.to)} fill="none" stroke="#38bdf8"
              vectorEffect="non-scaling-stroke" strokeWidth="2.75" strokeLinecap="round"
              className="workspace-build-edge-flow" style={{ animationDelay: `-${index * 0.14}s` }} />
          </g>)}
        </svg>
        {pendingMindmapGeometry.nodes.map((node, index) => <PendingMindmapNode key={node.id}
          label={c[node.kind]} kind={node.kind} x={node.x} y={node.y} delay={0.05 + index * 0.06} />)}
      </div>
    </div>}
  </motion.div>;
}
