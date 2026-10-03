import { Sparkles } from 'lucide-react';

/** Decorative Lesson Author persona avatar with a deterministic icon fallback. */
export function WorkspaceAiAvatar({ src, compact = false }: { src?: string | null; compact?: boolean }) {
  return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-primary/25 bg-primary/10 text-primary shadow-sm ${compact ? 'h-9 w-9 rounded-lg sm:h-10 sm:w-10' : 'h-11 w-11 rounded-2xl'}`}>
    <Sparkles className="h-5 w-5" aria-hidden />
    {src && <img key={src} src={src} alt="" className="absolute inset-0 h-full w-full object-cover"
      onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}
