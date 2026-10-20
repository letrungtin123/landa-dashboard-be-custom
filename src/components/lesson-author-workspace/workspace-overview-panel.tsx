import type { CSSProperties, ReactNode } from 'react';
import { Blocks, BookOpenCheck, CheckCircle2, GitBranch, ListTree, Network } from 'lucide-react';
import { Badge } from '../ui/badge';
import type {
  WorkspaceArchitecturePreview, WorkspaceArchitecturePreviewState, WorkspaceGraph, WorkspaceLocale, WorkspaceNode, WorkspaceStatus,
} from '../../api/lesson-author-workspace.contract';
import {
  WorkspaceAggregateContent, WorkspaceCourseOverviewSkeleton, workspaceCopy, workspaceDetailMatches, workspaceLearningOutcomeLabel,
  type WorkspaceTypedDetail,
} from './workspace-node-detail';
import { workspaceOverviewCounts } from './workspace-graph.logic';
import { WorkspaceBuildBeacon } from './workspace-build-beacon';
import { WorkspacePendingSkeleton } from './workspace-pending-skeleton';
import { WorkspaceTerminalPanel } from './workspace-terminal-panel';

export function WorkspacePlanningOverview({ preview, locale }: {
  preview: WorkspaceArchitecturePreview;
  locale: WorkspaceLocale;
}) {
  const c = workspaceCopy[locale];
  const count = (kind: WorkspaceNode['kind']) => preview.nodes.filter(node => node.kind === kind).length;
  const metrics = [
    { label: c.chapterCount, value: preview.total_chapters || '—', icon: GitBranch, accent: '#3b82f6', tone: 'text-primary bg-primary/10 border-primary/20' },
    { label: c.sectionCount, value: count('lesson'), icon: ListTree, accent: '#8b5cf6', tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20 dark:text-violet-300' },
    { label: c.lessonCount, value: count('unit'), icon: BookOpenCheck, accent: '#10b981', tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300' },
    { label: c.interactiveCount, value: count('component'), icon: Blocks, accent: '#f59e0b', tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300' },
  ] as const;
  const stateLabel = (state: WorkspaceArchitecturePreviewState) => state === 'ready'
    ? (locale === 'vi' ? 'Đã tạo cấu trúc' : 'Structure ready')
    : state === 'needs_action' ? (locale === 'vi' ? 'Cần kiểm tra' : 'Needs review')
      : state === 'generating' ? c.generating : c.planned;
  return <div className="mx-auto max-w-5xl px-4 py-5 sm:px-5 sm:py-6" role="status" aria-live="polite">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(item => { const Icon = item.icon; return <div key={item.label} className="workspace-build-card flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm"
      style={{ '--workspace-build-accent': item.accent } as CSSProperties}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4.5 w-4.5" aria-hidden /></span>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="workspace-build-value text-lg font-bold tabular-nums text-foreground">{item.value}</p><WorkspaceBuildBeacon /></div>
        <p className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted-foreground">{item.label}</p></div>
    </div>; })}</div>
    <section className="workspace-build-card mt-4 overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm"
      style={{ '--workspace-build-accent': '#3b82f6' } as CSSProperties}>
      <div className="flex items-start gap-3 border-b border-border/60 bg-primary/[0.04] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Network className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{c.course}</p>
          <p className="mt-1 truncate font-semibold text-foreground" title={preview.course_title}>{preview.course_title}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><WorkspaceBuildBeacon />
            {locale === 'vi' ? 'Nội dung đang được tạo và sẽ xuất hiện ngay khi sẵn sàng.' : 'Content is being created and will appear as soon as it is ready.'}</p>
        </div>
      </div>
      {preview.chapters.length > 0 ? <div className="grid gap-3 p-4 md:grid-cols-2">{preview.chapters.map(chapter => <article key={chapter.chapter_key}
        className={`${chapter.state !== 'needs_action' ? 'workspace-build-card' : ''} rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5`}
        style={{ '--workspace-build-accent': '#8b5cf6' } as CSSProperties}>
          <div className="flex items-start justify-between gap-3"><p className="min-w-0 text-sm font-semibold text-foreground">{chapter.title}</p>
            <Badge variant="outline" className="h-5 shrink-0 gap-1 rounded-full border-violet-500/25 px-2 text-[10px] text-violet-600 dark:text-violet-300">
            {chapter.state !== 'needs_action' && <WorkspaceBuildBeacon />}{stateLabel(chapter.state)}
          </Badge></div>
      </article>)}</div> : <div className="p-4"><div className="workspace-build-shimmer h-3 w-2/3 rounded bg-muted" aria-hidden /><div className="workspace-build-shimmer mt-2 h-3 w-1/2 rounded bg-muted/70" aria-hidden /></div>}
    </section>
  </div>;
}

export function WorkspaceOverview({ graph, preview, details, locale, loading, terminal, onRefresh, terminalActions, renderChapterAction }: { graph: WorkspaceGraph | null;
  preview: WorkspaceArchitecturePreview | null;
  details: readonly WorkspaceTypedDetail[]; locale: WorkspaceLocale; loading: boolean;
  terminal: WorkspaceStatus | null; onRefresh?: () => void; terminalActions?: ReactNode;
  renderChapterAction?: (chapter: WorkspaceNode) => ReactNode }) {
  const c = workspaceCopy[locale];
  if (!graph?.overview_ready) return preview ? <WorkspacePlanningOverview preview={preview} locale={locale} />
    : loading ? <WorkspacePendingSkeleton locale={locale} stage="overview" />
    : terminal ? <WorkspaceTerminalPanel locale={locale} status={terminal} onRefresh={onRefresh} actions={terminalActions} /> : <p className="p-4" role="status">{c.emptyOverview}</p>;
  const course = graph.nodes.find(n => n.kind === 'course');
  const chapters = graph.nodes.filter(n => n.kind === 'chapter').sort((a, b) => a.sort_order - b.sort_order);
  const counts = workspaceOverviewCounts(graph);
  const detailFor = (node: WorkspaceNode) => details.find(d => d.workspace_id === graph.workspace_id && d.correlation_id === graph.correlation_id
    && d.content_locale === graph.content_locale && workspaceDetailMatches(node, d));
  const courseDetail = course ? detailFor(course) : undefined;
  function outcomes(node: WorkspaceNode): string[] | null {
    const detail = detailFor(node);
    const data = detail?.content?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const value = data.learning_outcomes ?? data.learning_objectives;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim())
      .map(workspaceLearningOutcomeLabel).slice(0, 24) : [];
  }
  return <div className="mx-auto max-w-5xl px-4 py-5 sm:px-5 sm:py-6">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label: c.chapterCount, value: counts.chapters, icon: GitBranch, tone: 'text-primary bg-primary/10 border-primary/20' },
        { label: c.sectionCount, value: counts.sections, icon: ListTree, tone: 'text-violet-600 bg-violet-500/10 border-violet-500/20 dark:text-violet-300' },
        { label: c.lessonCount, value: counts.lessons, icon: BookOpenCheck, tone: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-300' },
        { label: c.interactiveCount, value: counts.interactive, icon: Blocks, tone: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-300' },
      ].map(item => { const Icon = item.icon; return <div key={item.label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${item.tone}`}><Icon className="h-4.5 w-4.5" aria-hidden /></span>
        <div className="min-w-0"><p className="text-xl font-bold tabular-nums leading-none">{item.value}</p><p className="mt-1 text-[10px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted-foreground">{item.label}</p></div>
      </div>; })}
    </div>
    {course && <div className="mt-4">
      {courseDetail ? <WorkspaceAggregateContent detail={courseDetail} locale={locale} />
        : <WorkspaceCourseOverviewSkeleton locale={locale} />}
    </div>}
    <div className="relative mt-5">
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.09] to-card p-4 shadow-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><GitBranch className="h-5 w-5" /></span>
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">{c.chapters}</p>
          <h2 className="break-words text-base font-semibold">{course?.title ?? c.course}</h2></div>
      </div>
      <div className="relative ml-9 border-l-2 border-primary/35 pb-2 pl-7 pt-4">
        {chapters.map((node, index) => { const values = outcomes(node); return <section key={node.node_id} className="relative mb-4 last:mb-0">
        <span className="absolute -left-[1.82rem] top-7 h-0.5 w-7 bg-primary/35" aria-hidden />
        <span className="absolute -left-[2.25rem] top-[1.35rem] flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary/50 bg-background" aria-hidden><span className="h-1.5 w-1.5 rounded-full bg-primary" /></span>
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.55)] sm:p-5">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BookOpenCheck className="h-4 w-4" /></span>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{c.chapter} {index + 1}</p><h3 className="mt-1 break-words text-sm font-semibold leading-5">{node.title ?? c.chapter}</h3></div></div>
          {values === null ? <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5" aria-label={c.loading} role="status"><p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300"><BookOpenCheck className="h-3.5 w-3.5" aria-hidden />{c.outcomes}</p><div className="animate-pulse space-y-2" aria-hidden><div className="h-3 w-5/6 rounded bg-violet-500/10" /><div className="h-3 w-2/3 rounded bg-violet-500/10" /></div></div>
            : values.length ? <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.045] p-3.5"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">{c.outcomes}</p><ul className="space-y-2">{values.map((value, valueIndex) => <li key={valueIndex} className="flex gap-2 text-sm leading-5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" /><span className="min-w-0 break-words">{value}</span></li>)}</ul></div>
              : <p className="mt-4 rounded-xl border border-border/60 bg-muted/25 p-3 text-sm text-muted-foreground">{c.notAvailable}</p>}
          {renderChapterAction?.(node)}
        </div>
        </section>; })}
      </div>
    </div>
  </div>;
}
