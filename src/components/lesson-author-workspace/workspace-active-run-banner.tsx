import { Activity } from 'lucide-react';

/** Presentational: another person's AI course design session is running on
 * this course. Text comes from workspaceActiveRunNotice(); null renders nothing. */
export function WorkspaceActiveRunNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="status" data-testid="workspace-active-run-notice"
    className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
    <Activity className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
    <span>{text}</span>
  </p>;
}
