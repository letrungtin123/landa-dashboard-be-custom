import {
  Blocks, CircleDot, FileText, GitBranch, Grid3X3, HelpCircle, Image as ImageIcon, ListOrdered, Map as MapIcon,
  MessageCircleQuestion, Network, Video, Workflow,
} from 'lucide-react';
import type { WorkspaceLocale, WorkspaceNode } from '../../api/lesson-author-workspace.contract';
import { workspaceCopy } from './workspace-node-detail';

/** Mirrors the established Blueprint mindmap visual contract on `main`.
 * Workspace state is deliberately mapped only for presentation; it never
 * changes the server-owned workspace state machine. */
export type WorkspaceMindmapStatus = 'applied' | 'pending' | 'edited' | 'proposal';

export const statusClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-700/70 dark:bg-emerald-950/35 dark:text-emerald-200',
  pending: 'border-slate-300/60 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
  edited: 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200',
  proposal: 'border-green-300/70 bg-green-50 text-green-700 dark:border-green-700/70 dark:bg-green-950/40 dark:text-green-200',
};

export const nodeShellClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-emerald-950/5 dark:border-emerald-700 dark:bg-emerald-950/55 dark:text-emerald-50',
  pending: 'border-slate-300 bg-slate-50 text-slate-950 shadow-slate-950/5 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-50',
  edited: 'border-yellow-500 bg-yellow-50 text-yellow-950 shadow-yellow-950/5 dark:border-yellow-600 dark:bg-yellow-950/55 dark:text-yellow-50',
  proposal: 'border-green-400 bg-green-50 text-green-950 shadow-green-950/10 dark:border-green-600 dark:bg-green-950/55 dark:text-green-50',
};

export const nodeAccentClassName: Record<WorkspaceMindmapStatus, string> = {
  applied: 'bg-emerald-500',
  pending: 'bg-slate-500',
  edited: 'bg-amber-500',
  proposal: 'bg-green-500',
};

export const edgeColor: Record<WorkspaceMindmapStatus, string> = {
  applied: '#10b981',
  pending: '#94a3b8',
  edited: '#f59e0b',
  proposal: '#22c55e',
};

type WorkspaceNodeVisualSource = Pick<WorkspaceNode, 'kind' | 'component_type' | 'media_type'>;

/** Status belongs to the card surface; content identity belongs to the icon.
 * Keeping these channels independent prevents a quiz, diagram or media brief
 * from turning back into the same generic question-mark glyph. */
export function getWorkspaceNodeVisual(node: WorkspaceNodeVisualSource) {
  if (node.kind === 'course') return { Icon: Network, key: 'course', tone: 'text-blue-600 dark:text-blue-300' };
  if (node.kind === 'chapter') return { Icon: GitBranch, key: 'chapter', tone: 'text-violet-600 dark:text-violet-300' };
  if (node.kind === 'lesson') return { Icon: CircleDot, key: 'lesson', tone: 'text-cyan-600 dark:text-cyan-300' };
  if (node.kind === 'unit') return { Icon: MapIcon, key: 'unit', tone: 'text-emerald-600 dark:text-emerald-300' };
  if (node.kind === 'media_brief') {
    if (node.media_type === 'video') return { Icon: Video, key: 'media-video', tone: 'text-rose-600 dark:text-rose-300' };
    return { Icon: ImageIcon, key: 'media-infographic', tone: 'text-sky-600 dark:text-sky-300' };
  }
  if (node.kind === 'component') {
    if (node.component_type === 'html') return { Icon: FileText, key: 'component-html', tone: 'text-sky-600 dark:text-sky-300' };
    if (node.component_type === 'problem') return { Icon: HelpCircle, key: 'component-problem', tone: 'text-rose-600 dark:text-rose-300' };
    if (node.component_type === 'la_faq') return { Icon: MessageCircleQuestion, key: 'component-faq', tone: 'text-violet-600 dark:text-violet-300' };
    if (node.component_type === 'la_sortable') return { Icon: ListOrdered, key: 'component-sortable', tone: 'text-orange-600 dark:text-orange-300' };
    if (node.component_type === 'la_crossword') return { Icon: Grid3X3, key: 'component-crossword', tone: 'text-fuchsia-600 dark:text-fuchsia-300' };
    if (node.component_type === 'la_diagram') return { Icon: Workflow, key: 'component-diagram', tone: 'text-teal-600 dark:text-teal-300' };
    return { Icon: Blocks, key: 'component', tone: 'text-slate-600 dark:text-slate-300' };
  }
  return { Icon: FileText, key: 'content', tone: 'text-slate-600 dark:text-slate-300' };
}

export function workspaceBuildAccent(node: WorkspaceNodeVisualSource): string {
  if (node.kind === 'course') return '#3b82f6';
  if (node.kind === 'chapter') return '#8b5cf6';
  if (node.kind === 'lesson') return '#06b6d4';
  if (node.kind === 'unit' || node.kind === 'media_brief') return '#10b981';
  if (node.component_type === 'html') return '#0ea5e9';
  if (node.component_type === 'problem') return '#f43f5e';
  if (node.component_type === 'la_faq') return '#8b5cf6';
  if (node.component_type === 'la_sortable') return '#f97316';
  if (node.component_type === 'la_crossword') return '#d946ef';
  if (node.component_type === 'la_diagram') return '#14b8a6';
  return '#f59e0b';
}

const workspaceComponentLabelKeys = {
  html: 'componentHtml', problem: 'componentProblem', la_faq: 'componentFaq',
  la_sortable: 'componentSortable', la_crossword: 'componentCrossword', la_diagram: 'componentDiagram',
} as const;

/** Component pills use only the server-owned discriminator. Never infer a
 * content type from a generated title or payload shape. */
export function workspaceNodeTypeLabel(node: Pick<WorkspaceNode, 'kind' | 'component_type' | 'media_type'>, locale: WorkspaceLocale): string {
  const c = workspaceCopy[locale];
  if (node.kind === 'component') {
    const key = node.component_type ? workspaceComponentLabelKeys[node.component_type] : undefined;
    return key ? c[key] : c.component;
  }
  if (node.kind === 'media_brief') {
    if (node.media_type === 'video') return c.mediaVideo;
    if (node.media_type === 'static_infographic') return c.mediaInfographic;
  }
  return c[node.kind];
}

export function workspaceMindmapStatus(node: Pick<WorkspaceNode, 'kind' | 'applied' | 'user_modified'>): WorkspaceMindmapStatus {
  // Apply wins after a successful exact-revision receipt. A later Save changes
  // the revision, so the server projection becomes false and the node is yellow.
  if (node.kind === 'media_brief') return 'proposal';
  if (node.applied) return 'applied';
  if (node.user_modified) return 'edited';
  return 'pending';
}
