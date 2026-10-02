import { Map as MapIcon, Moon, Sun, Target } from 'lucide-react';
import { useTheme } from 'next-themes';
import { WorkspacePendingSkeleton } from '@/components/lesson-author-workspace/workspace-dialog';

export const AI_ID_MINDMAP_SKELETON_PREVIEW_PATH = '/__dev/ai-id-mindmap-skeleton';

/** Development-only visual harness. It owns no workspace/session/source
 * controller and therefore cannot launch generation or call a provider. */
export default function DevAiIdMindmapSkeletonPage() {
  const { theme, setTheme } = useTheme();
  if (!import.meta.env.DEV) return null;
  const dark = theme === 'dark';
  return <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background text-foreground">
    <header className="flex shrink-0 items-center justify-between gap-4 border-b bg-card px-4 py-3 shadow-sm sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><MapIcon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0"><h1 className="truncate text-base font-semibold">AI Instructional Design · Mindmap skeleton preview</h1>
          <p className="text-xs text-muted-foreground">DEV only · Không tạo workspace, không gọi AI hoặc API nội dung.</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex items-center rounded-xl border border-border/70 bg-muted/45 p-1 shadow-inner" aria-label="Chế độ màu preview">
          <button type="button" aria-pressed={!dark} onClick={() => setTheme('light')}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${!dark ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Sun className="h-3.5 w-3.5" aria-hidden />Light
          </button>
          <button type="button" aria-pressed={dark} onClick={() => setTheme('dark')}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${dark ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            <Moon className="h-3.5 w-3.5" aria-hidden />Dark
          </button>
        </div>
        <span className="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 sm:inline-flex dark:text-amber-300">Visual QA</span>
      </div>
    </header>
    <div className="grid shrink-0 grid-cols-2 gap-1 border-b bg-muted/20 p-2">
      <div className="flex h-9 items-center justify-center gap-2 rounded-lg text-xs font-medium text-muted-foreground"><Target className="h-3.5 w-3.5" aria-hidden />Tổng quan</div>
      <div className="flex h-9 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/10 text-xs font-semibold text-primary shadow-sm"><MapIcon className="h-3.5 w-3.5" aria-hidden />Mindmap toàn khóa</div>
    </div>
    <section className="min-h-0 flex-1 overflow-hidden">
      <WorkspacePendingSkeleton locale="vi" stage="mindmap" />
    </section>
  </main>;
}
